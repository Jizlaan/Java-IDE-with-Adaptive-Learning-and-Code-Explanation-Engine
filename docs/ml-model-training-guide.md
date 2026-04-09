# PyTorch ML Training & Integration Guidelines

This document outlines the strategic architecture, training loop requirements, and weight-saving procedures for the Data Science team. The goal is to train a custom **RNN + Feedforward (FNN)** model designed to classify Java code smells and contextualize runtime/compiler errors.

---

## 1. The Big Picture: Architecture Flow
Your model must act as an entirely seamless, invisible pre-processor in the application's pipeline. It will sit globally decoupled from the LLM, acting purely as a telemetry extractor. This creates a "hand in glove" architecture where structural parsing is handled by your deterministic PyTorch model, and human-facing dialogue is handled dynamically by a third-party LLM context.

```text
  Student runs faulty Java code
            ↓
  Next.js catches the Stack Trace
            ↓
  [Your PyTorch ML Model API]     ← Returns { "root_cause": "NPE", "smells": [...] }
            ↓
  [Groq LLaMA 3.1 API]            ← Next.js merges your JSON into a hidden system prompt
            ↓
  Sidebar Chat Feed               ← Output shown as a warm, human mentor
```

---

## 2. Real Datasets for Baseline Training
To avoid starting from scratch, the Data Science team should bootstrap the RNN training pipeline using these highly vetted, open-source Java bug and code-smell datasets:

**A. Error Classification & Bug Detection Datasets**
- **[Defects4J](https://github.com/rjust/defects4j)**: Extremely critical for the error pipeline. Contains hundreds of real, reproducible Java bugs extracted from major open-source projects, complete with stack traces, failing test cases, and the patched solutions.
- **[CodeXGLUE (Defect Detection)](https://huggingface.co/datasets/code_x_glue_cc_defect_detection)**: A massive curated dataset by Microsoft specifically for recognizing structurally flawed or buggy code snippets.

**B. Code Smell Datasets**
- **[MLCQ Dataset](https://github.com/dspinellis/mlcq)**: An industry-standard dataset containing thousands of explicitly labeled Java code smells (God Classes, Feature Envy, Long Methods, etc.) manually validated by software engineers.
- **[BigCloneBench](https://github.com/clonebench/BigCloneBench)**: The standard dataset for detecting code clones and copy-paste design flaws in Java.

Your data engineering phase should merge these resources to create the core `(Java_Snippet, Stack_Trace) -> (Smell_Label, Error_Root_Cause)` mapping.

---

## 3. Model Architecture Definitions
Map the raw sequences into a custom PyTorch classification network without relying on pre-packaged Transformers.

**Data Flow Pipeline:**
1. **Input Composition**: Combine the `Java Source Code` and the `Raw Stderr` using a separator token, matching exactly what the Next.js frontend will capture.
2. **Tokenizer Layer**: Utilize WordPiece, Byte-Pair Encoding or generic vocabulary tokenizers.
3. **RNN Layer (LSTM/GRU)**: Design a Bidirectional RNN that processes the sequence tokens step-by-step to capture temporal code dependencies from both directions.
4. **Feedforward Layer (FNN)**: Condense the final RNN hidden states (concatenating forward and backward passes) into a Dense sequence with Dropout for regularization.
5. **Output**: Produce classification logits mapping to predefined Root Cause Classes and Smell Identifiers.

---

## 4. Training Loop Guidelines
Leverage highly-optimized native Pytorch training loops using standard DataLoaders.

- **Objective Function**: Use `CrossEntropyLoss` for single-cause errors, or `BCEWithLogitsLoss` if the architecture allows for multi-label smell identification.
- **Optimization**: Use `AdamW` as the primary optimizer to ensure proper weight decay on the dense layers.
- **Gradient Management**: Exploding gradients are common when processing long code sequences through Recurrent layers. You MUST implement gradient clipping (`clip_grad_norm_`) during the backward pass.
- **Device Management**: Ensure tensors are properly pushed to CUDA during the batch iteration to maximize throughput.

---

## 5. State Persistence Guidelines
Proper weight serialization is critical for deploying the model across different server environments without breaking class references.

- **Avoid Direct Saves**: Never save the entire model object directly (e.g., `torch.save(model)`). This fundamentally ties your saved file to the exact directory structure of your training script.
- **Use State Dictionaries**: You must extract and save the `state_dict()` of both the model and the optimizer.
- **Checkpoint Telemetry**: Within your dictionary file, always bundle the current `epoch`, the `loss` metrics, and the required `vocab_size` configuration so the backend deployment team can easily instantiate the exact structural dimensions needed to load the weights.

---

## 6. Deployment API Contract (The "Hand in Glove" Fit)
To seamlessly drop your PyTorch model into the existing IDE pipeline, the FastAPI inference server must perfectly adhere to the frontend's expected API signature.

**The Endpoint Requirements:**
The Web Engineering team is configuring `/src/app/api/chat/route.ts` to execute a synchronous fetch directly to your server before talking to Groq LLaMA. 

Your deployed inference server must accept exactly this POST request payload:
**Expected Request Payload from Next.js (Input):**
- Method: `POST`
- Content-Type: `application/json`
- Schema:
  - `code`: The raw Java string contents.
  - `error_stack`: The extracted standard-error output directly from the JVM.

**Expected Response Payload from PyTorch API (Output):**
Your model must map the tensor logits back into human-readable strings before returning the response. The Next.js stack expects exact telemetry:
- Schema:
  - `success`: `boolean`
  - `analysis`:
    - `error_type`: e.g., `"NullPointerException"` or `"SyntaxError"`
    - `detected_smells`: Generic anti-pattern flags, e.g., `"Deeply Nested Logic"`, `"God Class"`
    - `root_cause_context`: Brief semantic description of the tensor's classification decision.

**Deliverable**: Provide the Web team with the production IP/URL of this specific payload handler. Next.js will inject your `analysis` output directly into the Groq system prompt, uniting the two systems flawlessly without changing the frontend logic!
