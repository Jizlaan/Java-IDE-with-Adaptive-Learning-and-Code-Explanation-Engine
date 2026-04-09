"""
server.py — Code Smell Detection API (matches ModelNew.ipynb exactly)
Place this file in the same folder as your weights/ directory.

Folder structure required:
  server.py
  weights/
    FNN_Feature_Envy_best.pth
    FNN_Feature_Envy_zen_best.pth
    FNN_God_Class_best.pth
    FNN_God_Class_zen_best.pth
    FNN_Long_Method_best.pth
    RNN_Feature_Envy_best.pth
    RNN_Feature_Envy_zen_best.pth
    RNN_God_Class_best.pth
    RNN_God_Class_zen_best.pth
    RNN_Long_Method_best.pth

Run with: uvicorn server:app --port 5000
"""

import os
import re
import numpy as np
import torch
import torch.nn as nn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sklearn.preprocessing import RobustScaler

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants — must match ModelNew.ipynb exactly ────────────────────────────
WEIGHTS_DIR = "weights"
SEQ_LEN     = 4       # RNN uses 4 time-steps (changed from old notebook)
N_FEATURES  = 18      # number of extracted code features
DEVICE      = torch.device("cpu")

# All smell keys (matches both dataset sources)
CODE_SMELLS = [
    "Feature_Envy",
    "Feature_Envy_zen",
    "God_Class",
    "God_Class_zen",
    "Long_Method",
]

# Model configs — copied directly from ModelNew.ipynb Cell 7
FNN_CFG = {
    "hidden_dims": [128, 64, 32],
    "dropout":      0.3,
}
RNN_CFG = {
    "hidden_dim": 64,
    "layers":     2,
    "dropout":    0.3,
}


# ── Model definitions — copied from ModelNew.ipynb Cell 5 ───────────────────
class FeedForwardNet(nn.Module):
    def __init__(self, input_dim, hidden_dims, dropout=0.4):
        super().__init__()
        layers, prev = [], input_dim
        for h in hidden_dims:
            layers += [nn.Linear(prev, h), nn.BatchNorm1d(h),
                       nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x).squeeze(-1)


class RecurrentNet(nn.Module):
    def __init__(self, input_dim, hidden_dim, num_layers=2, dropout=0.3):
        super().__init__()
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers,
                            batch_first=True,
                            dropout=dropout if num_layers > 1 else 0,
                            bidirectional=True)
        self.bn   = nn.BatchNorm1d(hidden_dim * 2)
        self.drop = nn.Dropout(dropout)
        self.fc   = nn.Linear(hidden_dim * 2, 1)

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(self.drop(self.bn(out[:, -1, :]))).squeeze(-1)


# ── Load weights at startup ──────────────────────────────────────────────────
fnn_models = {}
rnn_models = {}

for smell in CODE_SMELLS:
    fnn_path = os.path.join(WEIGHTS_DIR, f"FNN_{smell}_best.pth")
    rnn_path = os.path.join(WEIGHTS_DIR, f"RNN_{smell}_best.pth")

    # FNN — input dim is always N_FEATURES (18)
    if os.path.exists(fnn_path):
        m = FeedForwardNet(N_FEATURES, FNN_CFG["hidden_dims"], FNN_CFG["dropout"])
        m.load_state_dict(torch.load(fnn_path, map_location=DEVICE))
        m.eval()
        fnn_models[smell] = m
        print(f"  ✓ FNN loaded: {smell}")
    else:
        print(f"  ✗ FNN missing: {fnn_path}")

    # RNN — input dim is features_per_step after padding to SEQ_LEN
    if os.path.exists(rnn_path):
        pad = (SEQ_LEN - N_FEATURES % SEQ_LEN) % SEQ_LEN
        fps = (N_FEATURES + pad) // SEQ_LEN
        m = RecurrentNet(fps, RNN_CFG["hidden_dim"],
                         RNN_CFG["layers"], RNN_CFG["dropout"])
        m.load_state_dict(torch.load(rnn_path, map_location=DEVICE))
        m.eval()
        rnn_models[smell] = m
        print(f"  ✓ RNN loaded: {smell}")
    else:
        print(f"  ✗ RNN missing: {rnn_path}")

print(f"\nFNN models loaded: {list(fnn_models.keys())}")
print(f"RNN models loaded: {list(rnn_models.keys())}")


# ── Feature extraction — copied from ModelNew.ipynb Cell 14 ─────────────────
def extract_features(code: str) -> np.ndarray:
    lines    = code.split("\n")
    nonempty = [l for l in lines if l.strip()]
    loc      = len(nonempty)
    cyclo    = 1 + sum(code.count(k) for k in
                       ["if", "else", "for", "while", "case", "catch", "&&", "||", "?"])
    params   = len(re.findall(r",", code)) + (1 if re.search(r"\(\S", code) else 0)
    branches = code.count("if") + code.count("else") + code.count("switch")
    loops    = code.count("for") + code.count("while") + code.count("do")
    lvars    = len(re.findall(
        r"\b(int|double|float|String|boolean|long|char|byte)\s+\w+\s*[=;]", code))

    depth = 0; mx = 0
    for c in code:
        if c == "{":
            depth += 1; mx = max(mx, depth)
        elif c == "}":
            depth = max(0, depth - 1)

    mcalls  = len(re.findall(r"\w+\s*\(", code))
    conds   = code.count("if") + code.count("? ")
    rets    = code.count("return")
    scases  = code.count("case ")
    ecalls  = len(re.findall(r"\w+\.\w+\s*\(", code))
    methods = re.findall(r"(public|private|protected)\s+\w+\s+\w+\s*\(", code)
    aml     = loc / max(len(methods), 1)
    lits    = len(re.findall(r'"[^"]*"|\b\d+\.?\d*\b', code))
    cmts    = code.count("//") + code.count("/*")
    asgns   = len(re.findall(r"(?<![=!<>])=(?!=)", code))
    excs    = code.count("throw") + code.count("catch") + code.count("throws")
    flds    = len(re.findall(
        r"(private|public|protected)\s+(static\s+)?(final\s+)?\w+\s+\w+\s*;", code))

    return np.array([loc, cyclo, params, branches, loops, lvars, mx, mcalls, conds,
                     rets, scases, ecalls, aml, lits, cmts, asgns, excs, flds],
                    dtype=np.float32)


def predict_smells(code: str, threshold: float = 0.5) -> dict:
    raw = extract_features(code)

    # Scale features using RobustScaler (matches training)
    scaler     = RobustScaler()
    raw_scaled = scaler.fit_transform(raw.reshape(1, -1)).flatten()

    results = {}

    for smell in CODE_SMELLS:
        scores = []

        with torch.no_grad():
            # FNN
            if smell in fnn_models:
                feat = raw_scaled[:N_FEATURES].astype(np.float32)
                x    = torch.tensor(feat).unsqueeze(0)
                prob = torch.sigmoid(fnn_models[smell](x)).item()
                scores.append(prob)

            # RNN
            if smell in rnn_models:
                pad  = (SEQ_LEN - N_FEATURES % SEQ_LEN) % SEQ_LEN
                feat = np.pad(raw_scaled, (0, pad)).astype(np.float32)
                fps  = len(feat) // SEQ_LEN
                x    = torch.tensor(feat).view(1, SEQ_LEN, fps)
                prob = torch.sigmoid(rnn_models[smell](x)).item()
                scores.append(prob)

        if scores:
            avg = float(np.mean(scores))
            results[smell] = {
                "probability": round(avg, 4),
                "detected":    avg >= threshold,
                "confidence":  "high" if avg >= 0.75 else "medium" if avg >= 0.5 else "low",
            }

    return results


# ── Smell metadata ───────────────────────────────────────────────────────────
SMELL_INFO = {
    "Feature_Envy": {
        "explanation": "This method uses data or methods from another class more than its own. It likely belongs in that other class.",
        "concepts":    ["Encapsulation", "Object-Oriented Design", "Move Method"],
        "resources":   [
            {"title": "Move Method",   "url": "https://refactoring.guru/move-method"},
            {"title": "Feature Envy",  "url": "https://refactoring.guru/smells/feature-envy"},
        ],
    },
    "Feature_Envy_zen": {
        "explanation": "Your method shows signs of feature envy — it is more interested in another class's data than its own responsibilities.",
        "concepts":    ["Encapsulation", "Object-Oriented Design"],
        "resources":   [{"title": "Move Method", "url": "https://refactoring.guru/move-method"}],
    },
    "God_Class": {
        "explanation": "This class is doing too much. A God Class knows too much and does too much — split it into smaller, focused classes.",
        "concepts":    ["Single Responsibility Principle", "Class Decomposition"],
        "resources":   [
            {"title": "Extract Class",      "url": "https://refactoring.guru/extract-class"},
            {"title": "God Class Pattern",  "url": "https://refactoring.guru/smells/large-class"},
        ],
    },
    "God_Class_zen": {
        "explanation": "Your class has grown too large and is handling too many responsibilities. Consider breaking it apart.",
        "concepts":    ["Single Responsibility Principle", "Class Decomposition"],
        "resources":   [{"title": "Extract Class", "url": "https://refactoring.guru/extract-class"}],
    },
    "Long_Method": {
        "explanation": "This method is too long. Long methods are hard to read, test, and maintain. Break it into smaller helper methods.",
        "concepts":    ["Extract Method Refactoring", "Single Responsibility Principle"],
        "resources":   [
            {"title": "Extract Method", "url": "https://refactoring.guru/extract-method"},
            {"title": "Clean Code",     "url": "https://www.baeldung.com/java-clean-code"},
        ],
    },
}


def build_response(smell_results: dict) -> dict:
    detected = [s for s, v in smell_results.items() if v["detected"]]

    if not detected:
        return {
            "explanation":     "No significant code smells detected. Your code structure looks good!",
            "missingConcepts": [],
            "resources":       [{"title": "Java Best Practices",
                                 "url": "https://docs.oracle.com/javase/tutorial/"}],
            "smellDetails":    smell_results,
        }

    explanations, concepts, resources = [], [], []
    for smell in detected:
        info  = SMELL_INFO.get(smell, {})
        prob  = smell_results[smell]["probability"]
        conf  = smell_results[smell]["confidence"]
        label = smell.replace("_zen", " (Zenodo)").replace("_", " ")
        explanations.append(
            f"{label} ({prob:.0%}, {conf} confidence): {info.get('explanation', '')}"
        )
        concepts.extend(info.get("concepts", []))
        for r in info.get("resources", []):
            if r not in resources:
                resources.append(r)

    return {
        "explanation":     " | ".join(explanations),
        "missingConcepts": list(dict.fromkeys(concepts)),
        "resources":       resources,
        "smellDetails":    smell_results,
    }


# ── Endpoints ────────────────────────────────────────────────────────────────
class CodeErrorRequest(BaseModel):
    code:  str
    error: str = ""


@app.post("/predict")
def predict(request: CodeErrorRequest):
    smell_results = predict_smells(request.code)
    return build_response(smell_results)


@app.get("/health")
def health():
    return {
        "status":            "ok",
        "fnn_models_loaded": list(fnn_models.keys()),
        "rnn_models_loaded": list(rnn_models.keys()),
    }
