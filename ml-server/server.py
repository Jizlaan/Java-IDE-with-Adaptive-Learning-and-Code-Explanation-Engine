"""
server.py — Code Smell Detection API
Architectures verified directly from .pth weight shapes.

Folder structure required:
  server.py
  weights/
    FNN_Feature_Envy_best.pth
    FNN_God_Class_best.pth
    FNN_Long_Method_best.pth
    RNN_Feature_Envy_best.pth
    RNN_God_Class_best.pth
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
import joblib

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Constants ────────────────────────────────────────────────────────────────
WEIGHTS_DIR = "weights"
SEQ_LEN     = 4
DEVICE      = torch.device("cpu")

CODE_SMELLS = ["Feature_Envy", "God_Class", "Long_Method"]

# Per-smell feature counts — read directly from FNN weight shapes (net.0.weight dim 1)
FNN_INPUT_DIMS = {
    "Feature_Envy": 83,
    "God_Class":    62,
    "Long_Method":  65,
}

# Per-smell RNN input_dim — read from lstm.weight_ih_l0 dim 1
# (= ceil(n_features / SEQ_LEN) after zero-padding)
RNN_INPUT_DIMS = {
    "Feature_Envy": 21,   # 84 / 4  (83 features padded to 84)
    "God_Class":    16,   # 64 / 4  (62 features padded to 64)
    "Long_Method":  17,   # 68 / 4  (65 features padded to 68)
}

# Shared RNN hyper-params — verified from weight shapes:
#   hidden_dim=128  (weight_hh_l* dim 1)
#   num_layers=3    (l0, l1, l2 present)
#   bidirectional   (weight_ih_l0_reverse present)
RNN_CFG = {"hidden_dim": 128, "layers": 3, "dropout": 0.4}

FNN_CFG = {"hidden_dims": [256, 128, 64, 32], "dropout": 0.4}


# ── Model definitions (match training notebook exactly) ──────────────────────

class AttentionLayer(nn.Module):
    """Additive attention over BiLSTM time-steps."""
    def __init__(self, hidden_dim: int):
        super().__init__()
        self.attention = nn.Linear(hidden_dim * 2, 1)   # (1, 256)

    def forward(self, lstm_out: torch.Tensor) -> torch.Tensor:
        # lstm_out: (batch, seq_len, hidden_dim*2)
        scores  = self.attention(lstm_out).squeeze(-1)   # (batch, seq_len)
        weights = torch.softmax(scores, dim=1)           # (batch, seq_len)
        return (lstm_out * weights.unsqueeze(-1)).sum(dim=1)  # (batch, hidden_dim*2)


class RecurrentNet(nn.Module):
    """3-layer BiLSTM + Attention + BN — verified against .pth shapes."""
    def __init__(self, input_dim: int, hidden_dim: int = 128,
                 num_layers: int = 3, dropout: float = 0.4):
        super().__init__()
        self.lstm      = nn.LSTM(input_dim, hidden_dim, num_layers,
                                 batch_first=True,
                                 dropout=dropout if num_layers > 1 else 0,
                                 bidirectional=True)
        self.attention = AttentionLayer(hidden_dim)
        self.bn        = nn.BatchNorm1d(hidden_dim * 2)
        self.drop      = nn.Dropout(dropout)
        self.fc        = nn.Linear(hidden_dim * 2, 1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(x)
        ctx    = self.attention(out)                      # attention pool all steps
        return self.fc(self.drop(self.bn(ctx))).squeeze(-1)


class FeedForwardNet(nn.Module):
    """256→128→64→32 FNN with BatchNorm — verified against .pth shapes."""
    def __init__(self, input_dim: int, hidden_dims=None, dropout: float = 0.4):
        super().__init__()
        if hidden_dims is None:
            hidden_dims = [256, 128, 64, 32]
        layers, prev = [], input_dim
        for h in hidden_dims:
            layers += [nn.Linear(prev, h), nn.BatchNorm1d(h),
                       nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(-1)


# ── Load all weights at startup ──────────────────────────────────────────────
fnn_models: dict = {}
rnn_models: dict = {}
fnn_scalers: dict = {}
rnn_scalers: dict = {}

for smell in CODE_SMELLS:
    fnn_path = os.path.join(WEIGHTS_DIR, f"FNN_{smell}_best.pth")
    rnn_path = os.path.join(WEIGHTS_DIR, f"RNN_{smell}_best.pth")
    fnn_scaler_path = os.path.join(WEIGHTS_DIR, f"scaler_FNN_{smell}.joblib")
    rnn_scaler_path = os.path.join(WEIGHTS_DIR, f"scaler_RNN_{smell}.joblib")

    # FNN
    if os.path.exists(fnn_path) and os.path.exists(fnn_scaler_path):
        m = FeedForwardNet(FNN_INPUT_DIMS[smell], FNN_CFG["hidden_dims"], FNN_CFG["dropout"])
        m.load_state_dict(torch.load(fnn_path, map_location=DEVICE, weights_only=True))
        m.eval()
        fnn_models[smell] = m
        fnn_scalers[smell] = joblib.load(fnn_scaler_path)
        print(f"  [+] FNN & Scaler loaded: {smell}")
    else:
        print(f"  [-] FNN or Scaler missing: {smell}")

    # RNN
    if os.path.exists(rnn_path) and os.path.exists(rnn_scaler_path):
        fps = RNN_INPUT_DIMS[smell]
        m = RecurrentNet(fps, RNN_CFG["hidden_dim"], RNN_CFG["layers"], RNN_CFG["dropout"])
        m.load_state_dict(torch.load(rnn_path, map_location=DEVICE, weights_only=True))
        m.eval()
        rnn_models[smell] = m
        rnn_scalers[smell] = joblib.load(rnn_scaler_path)
        print(f"  [+] RNN & Scaler loaded: {smell}")
    else:
        print(f"  [-] RNN or Scaler missing: {smell}")

print(f"\nFNN models loaded: {list(fnn_models.keys())}")
print(f"RNN models loaded: {list(rnn_models.keys())}")


# ── Feature extraction ───────────────────────────────────────────────────────
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


def _pad_and_slice(features: np.ndarray, n_features: int) -> np.ndarray:
    """Truncate or zero-pad a raw feature vector to exactly n_features."""
    if len(features) >= n_features:
        return features[:n_features]
    return np.pad(features, (0, n_features - len(features)))


def predict_smells(code: str, threshold: float = 0.5) -> dict:
    raw = extract_features(code)
    results = {}

    for smell in CODE_SMELLS:
        scores = []

        with torch.no_grad():
            # ── FNN ──────────────────────────────────────────────────────────
            if smell in fnn_models and smell in fnn_scalers:
                n   = FNN_INPUT_DIMS[smell]
                feat = _pad_and_slice(raw, n)
                feat_scaled = fnn_scalers[smell].transform(feat.reshape(1, -1)).flatten()
                
                x    = torch.tensor(feat_scaled).float().unsqueeze(0)
                prob = torch.sigmoid(fnn_models[smell](x)).item()
                scores.append(prob)

            # ── RNN ──────────────────────────────────────────────────────────
            if smell in rnn_models and smell in rnn_scalers:
                fps  = RNN_INPUT_DIMS[smell]
                n    = fps * SEQ_LEN
                feat = _pad_and_slice(raw, n)
                feat_scaled = rnn_scalers[smell].transform(feat.reshape(1, -1)).flatten()
                
                x    = torch.tensor(feat_scaled).float().view(1, SEQ_LEN, fps)
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
            {"title": "Move Method",  "url": "https://refactoring.guru/move-method"},
            {"title": "Feature Envy", "url": "https://refactoring.guru/smells/feature-envy"},
        ],
    },
    "God_Class": {
        "explanation": "This class is doing too much. A God Class knows too much and does too much — split it into smaller, focused classes.",
        "concepts":    ["Single Responsibility Principle", "Class Decomposition"],
        "resources":   [
            {"title": "Extract Class",     "url": "https://refactoring.guru/extract-class"},
            {"title": "God Class Pattern", "url": "https://refactoring.guru/smells/large-class"},
        ],
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
        label = smell.replace("_", " ")
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
    try:
        smell_results = predict_smells(request.code)
        return build_response(smell_results)
    except Exception as e:
        return {"error": "Feature extraction failed. Ensure the code is valid Java/C# syntax."}


@app.get("/health")
def health():
    return {
        "status":            "ok",
        "fnn_models_loaded": list(fnn_models.keys()),
        "rnn_models_loaded": list(rnn_models.keys()),
    }
