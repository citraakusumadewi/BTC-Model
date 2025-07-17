from fastapi import FastAPI
from pydantic import BaseModel
import numpy as np
import joblib
import tensorflow as tf
import datetime
import pytz
import os
from binance.client import Client

app = FastAPI()

print("📦 Loading model & scaler...")

BASE_DIR = os.path.dirname(__file__)

MODEL_PATH = os.path.join(BASE_DIR, "btc_gru_model.h5")
SCALER_PATH = os.path.join(BASE_DIR, "scaler.pkl")

model = tf.keras.models.load_model(MODEL_PATH, compile=False)
scaler = joblib.load(SCALER_PATH)

api_key = os.getenv("BINANCE_API_KEY", "")
api_secret = os.getenv("BINANCE_API_SECRET", "")
client = Client(api_key, api_secret)

def fetch_last_24_prices():
    klines = client.get_historical_klines(
        "BTCUSDT",
        Client.KLINE_INTERVAL_1HOUR,
        "24 hours ago UTC",
        "now"
    )
    closes = [float(k[4]) for k in klines[-24:]]
    return closes

def get_recommendation(pred, entry):
    if pred > entry * 1.01:
        return "Strong BUY"
    elif pred > entry:
        return "BUY"
    elif pred < entry * 0.99:
        return "Strong SELL"
    else:
        return "SELL"

@app.get("/")
def root():
    return {"message": "✅ AI Backend is running"}

@app.post("/predict")
def predict():
    # Ambil harga terakhir 24 jam dari Binance
    sequence = fetch_last_24_prices()
    entry_price = sequence[-1]

    # Scale & reshape
    sequence_scaled = scaler.transform(np.array(sequence).reshape(-1, 1)).reshape(1, 24, 1)

    # Prediksi
    pred_scaled = model.predict(sequence_scaled)[0][0]
    pred = scaler.inverse_transform(np.array([[0, pred_scaled]]))[0][1]

    # Rekomendasi
    reco = get_recommendation(pred, entry_price)

    return {
        "entry_price": float(entry_price),
        "predicted_price": float(pred),
        "recommendation": reco
    }