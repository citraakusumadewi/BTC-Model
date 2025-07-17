import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import GRU, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
from binance.client import Client
import itertools

# ===================
# 🔗 Ambil Data
# ===================
api_key = ''
api_secret = ''
client = Client(api_key, api_secret)

klines = client.get_historical_klines(
    "BTCUSDT", 
    Client.KLINE_INTERVAL_1HOUR, 
    "1 Jan, 2020", 
    "now"
)

data = pd.DataFrame(klines, columns=[
    'timestamp', 'open', 'high', 'low', 'close', 'volume', 
    'close_time', 'quote_asset_volume', 'number_of_trades', 
    'taker_buy_base_asset_volume', 'taker_buy_quote_asset_volume', 'ignore'
])
data['timestamp'] = pd.to_datetime(data['timestamp'], unit='ms')
data.set_index('timestamp', inplace=True)
data = data[['close']].astype(float)

scaler = MinMaxScaler()
scaled_data = scaler.fit_transform(data)

# ===================
# 📋 Fungsi Sliding Window
# ===================
def create_sliding_window(data, window_size):
    X, y = [], []
    for i in range(len(data) - window_size):
        X.append(data[i:i+window_size])
        y.append(data[i+window_size])
    return np.array(X), np.array(y)

# ===================
# 📋 Fungsi Model & Evaluasi
# ===================
def build_model(units, dropout_rate, input_shape):
    model = Sequential([
        GRU(units, return_sequences=False, input_shape=input_shape),
        Dropout(dropout_rate),
        Dense(1)
    ])
    model.compile(optimizer='adam', loss='mse')
    return model

def evaluate_model(model, X, y, scaler):
    y_pred = model.predict(X)
    y_true_inv = scaler.inverse_transform(np.concatenate([np.zeros_like(y), y], axis=1))[:,1]
    y_pred_inv = scaler.inverse_transform(np.concatenate([np.zeros_like(y_pred), y_pred], axis=1))[:,1]
    mae = mean_absolute_error(y_true_inv, y_pred_inv)
    mse = mean_squared_error(y_true_inv, y_pred_inv)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_true_inv, y_pred_inv)
    return mae, mse, rmse, r2, y_true_inv, y_pred_inv

# ===================
# 🔍 Hyperparameter Grid
# ===================
param_grid = {
    'window_size': [24, 48],
    'units': [32, 64],
    'dropout': [0.1, 0.2],
    'batch_size': [32, 64]
}

best_score = np.inf
best_params = None
best_model = None

# ===================
# 🔍 Grid Search
# ===================
for params in itertools.product(*param_grid.values()):
    window_size, units, dropout, batch_size = params
    print(f"🔷 Testing: window={window_size}, units={units}, dropout={dropout}, batch={batch_size}")
    
    X, y = create_sliding_window(scaled_data, window_size)
    split = int(0.7 * len(X))
    val_split = int(0.85 * len(X))
    
    X_train, y_train = X[:split], y[:split]
    X_val, y_val = X[split:val_split], y[split:val_split]
    X_test, y_test = X[val_split:], y[val_split:]
    
    model = build_model(units, dropout, (X_train.shape[1], X_train.shape[2]))
    early_stop = EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True)
    
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=20,
        batch_size=batch_size,
        verbose=0,
        callbacks=[early_stop]
    )
    
    val_mae, _, _, _, _, _ = evaluate_model(model, X_val, y_val, scaler)
    
    if val_mae < best_score:
        best_score = val_mae
        best_params = {
            'window_size': window_size,
            'units': units,
            'dropout': dropout,
            'batch_size': batch_size
        }
        best_model = model

print("\n✅ Best Hyperparameters:", best_params)
print("Validation MAE:", best_score)

# ===================
# 📈 Final Evaluasi
# ===================
window_size = best_params['window_size']
X, y = create_sliding_window(scaled_data, window_size)
split = int(0.7 * len(X))
val_split = int(0.85 * len(X))

X_train, y_train = X[:split], y[:split]
X_val, y_val = X[split:val_split], y[split:val_split]
X_test, y_test = X[val_split:], y[val_split:]

metrics_train = evaluate_model(best_model, X_train, y_train, scaler)
metrics_val   = evaluate_model(best_model, X_val, y_val, scaler)
metrics_test  = evaluate_model(best_model, X_test, y_test, scaler)

def print_metrics(label, metrics):
    mae, mse, rmse, r2, _, _ = metrics
    print(f"\n📊 {label} Set:")
    print(f"MAE  : {mae:.2f}")
    print(f"MSE  : {mse:.2f}")
    print(f"RMSE : {rmse:.2f}")
    print(f"R²   : {r2:.4f}")

print_metrics("Train", metrics_train)
print_metrics("Validation", metrics_val)
print_metrics("Test (Out-of-sample)", metrics_test)

# ===================
# 📊 Visualisasi
# ===================
def plot_predictions(dates, y_true, y_pred, title):
    plt.figure(figsize=(12,6))
    plt.plot(dates, y_true, label='Actual')
    plt.plot(dates, y_pred, label='Predicted')
    plt.title(title)
    plt.xlabel("Tanggal")
    plt.ylabel("Harga (USD)")
    plt.legend()
    plt.show()

val_dates  = data.index[-(len(y_val)+len(y_test)):-len(y_test)]
test_dates = data.index[-len(y_test):]

plot_predictions(val_dates, metrics_val[4], metrics_val[5], "Prediksi BTC/USD (Validation)")
plot_predictions(test_dates, metrics_test[4], metrics_test[5], "Prediksi BTC/USD (Out-of-sample Test)")

# ===================
# 💾 Simpan Model & Scaler
# ===================

# Simpan model ke file .h5
best_model.save("btc_gru_model.h5")
print("✅ Model disimpan sebagai btc_gru_model.h5")

# Simpan scaler ke file .pkl
import joblib
joblib.dump(scaler, "scaler.pkl")
print("✅ Scaler disimpan sebagai scaler.pkl")