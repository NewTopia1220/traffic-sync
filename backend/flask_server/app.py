import joblib
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import datetime
import xgboost

app = Flask(__name__)
CORS(app)

model = joblib.load('xgboost_traffic_model.joblib')

# 스테이션 매핑 데이터 (좌표 정보)
STATION_MAP = {
    0: {'lat': 37.56859, 'lng': 126.94843},
     1: {'lat': 37.572296, 'lng': 126.96285},
     2: {'lat': 37.588833, 'lng': 126.96855},
     3: {'lat': 37.59636, 'lng': 126.98421},
     4: {'lat': 37.576, 'lng': 126.984344},
     5: {'lat': 37.582527, 'lng': 126.99801},
     6: {'lat': 37.57819, 'lng': 127.00205},
     7: {'lat': 37.57326, 'lng': 127.01711},
     8: {'lat': 37.565712, 'lng': 127.02091},
     9: {'lat': 37.558563, 'lng': 127.0071},
     10: {'lat': 37.55689, 'lng': 127.004654},
     11: {'lat': 37.55743, 'lng': 126.97649},
     12: {'lat': 37.55806, 'lng': 126.97344},
     13: {'lat': 37.569775, 'lng': 126.97135},
     14: {'lat': 37.570217, 'lng': 126.99083},
     15: {'lat': 37.56282, 'lng': 126.97272},
     16: {'lat': 37.567497, 'lng': 126.97721},
     17: {'lat': 37.566113, 'lng': 126.98933},
     18: {'lat': 37.559593, 'lng': 126.97252},
     19: {'lat': 37.542404, 'lng': 127.00136},
     20: {'lat': 37.5443, 'lng': 126.98977},
     21: {'lat': 37.544495, 'lng': 126.98835},
     22: {'lat': 37.557045, 'lng': 126.976364},
     23: {'lat': 37.554897, 'lng': 126.98352},
     24: {'lat': 37.69179, 'lng': 127.04509},
     25: {'lat': 37.688572, 'lng': 127.055374},
     26: {'lat': 37.550896, 'lng': 127.108955},
     27: {'lat': 37.601475, 'lng': 127.11568},
     28: {'lat': 37.61994, 'lng': 127.10532},
     29: {'lat': 37.630726, 'lng': 127.09898},
     30: {'lat': 37.613823, 'lng': 127.1087},
     31: {'lat': 37.516777, 'lng': 127.14673},
     32: {'lat': 37.54746, 'lng': 127.175224},
     33: {'lat': 37.569893, 'lng': 127.157295},
     34: {'lat': 37.465084, 'lng': 127.03864},
     35: {'lat': 37.468796, 'lng': 127.12642},
     36: {'lat': 37.462418, 'lng': 127.10788},
     37: {'lat': 37.47113, 'lng': 127.12308},
     38: {'lat': 37.463287, 'lng': 126.98815},
     39: {'lat': 37.46009, 'lng': 127.030174},
     40: {'lat': 37.483906, 'lng': 127.01141},
     41: {'lat': 37.43701, 'lng': 126.90281},
     42: {'lat': 37.48243, 'lng': 126.84189},
     43: {'lat': 37.48261, 'lng': 126.84311},
     44: {'lat': 37.48618, 'lng': 126.8565},
     45: {'lat': 37.485043, 'lng': 126.8733},
     46: {'lat': 37.474934, 'lng': 126.87815},
     47: {'lat': 37.465046, 'lng': 126.88425},
     48: {'lat': 37.4514, 'lng': 126.891624},
     49: {'lat': 37.542778, 'lng': 126.80941},
     50: {'lat': 37.539227, 'lng': 126.82312},
     51: {'lat': 37.524876, 'lng': 126.83193},
     52: {'lat': 37.488613, 'lng': 126.82279},
     53: {'lat': 37.506104, 'lng': 126.8246},
     54: {'lat': 37.58531, 'lng': 126.79557},
     55: {'lat': 37.587814, 'lng': 126.8128},
     56: {'lat': 37.644684, 'lng': 126.91127},
     57: {'lat': 37.61788, 'lng': 126.90626},
     58: {'lat': 37.58747, 'lng': 126.88641},
     59: {'lat': 37.570904, 'lng': 126.87232},
     60: {'lat': 37.558388, 'lng': 127.11427},
     61: {'lat': 37.683254, 'lng': 127.05253},
     62: {'lat': 37.59812, 'lng': 126.80993},
     63: {'lat': 37.5566, 'lng': 126.88554},
     64: {'lat': 37.571568, 'lng': 126.862724},
     65: {'lat': 37.55268, 'lng': 126.89156},
     66: {'lat': 37.54291, 'lng': 126.90376},
     67: {'lat': 37.537537, 'lng': 126.92534},
     68: {'lat': 37.533627, 'lng': 126.936516},
     69: {'lat': 37.526745, 'lng': 126.94514},
     70: {'lat': 37.51816, 'lng': 126.95947},
     71: {'lat': 37.509937, 'lng': 126.98181},
     72: {'lat': 37.51443, 'lng': 126.996666},
     73: {'lat': 37.50826, 'lng': 126.99974},
     74: {'lat': 37.526947, 'lng': 127.01319},
     75: {'lat': 37.538208, 'lng': 127.01988},
     76: {'lat': 37.53677, 'lng': 127.03497},
     77: {'lat': 37.530296, 'lng': 127.05734},
     78: {'lat': 37.525513, 'lng': 127.064064},
     79: {'lat': 37.523823, 'lng': 127.09203},
     80: {'lat': 37.53379, 'lng': 127.10412},
     81: {'lat': 37.54267, 'lng': 127.112885},
     82: {'lat': 37.54412, 'lng': 127.11527},
     83: {'lat': 37.608685, 'lng': 126.9552},
     84: {'lat': 37.611546, 'lng': 126.97931},
     85: {'lat': 37.551918, 'lng': 127.01298},
     86: {'lat': 37.5272, 'lng': 127.0047},
     87: {'lat': 37.560715, 'lng': 127.06857},
     88: {'lat': 37.542007, 'lng': 127.020676},
     89: {'lat': 37.55381, 'lng': 127.0705},
     90: {'lat': 37.60393, 'lng': 127.044044},
     91: {'lat': 37.599754, 'lng': 127.02169},
     92: {'lat': 37.619938, 'lng': 127.08295},
     93: {'lat': 37.645706, 'lng': 127.03317},
     94: {'lat': 37.63158, 'lng': 127.06343},
     95: {'lat': 37.65241, 'lng': 127.061035},
     96: {'lat': 37.579685, 'lng': 126.90512},
     97: {'lat': 37.594933, 'lng': 126.94025},
     98: {'lat': 37.563507, 'lng': 126.9301},
     99: {'lat': 37.566265, 'lng': 126.930534},
     100: {'lat': 37.54016, 'lng': 126.825455},
     101: {'lat': 37.524082, 'lng': 126.83586},
     102: {'lat': 37.534374, 'lng': 126.84509},
     103: {'lat': 37.55925, 'lng': 126.83107},
     104: {'lat': 37.498245, 'lng': 126.85122},
     105: {'lat': 37.50644, 'lng': 126.884384},
     106: {'lat': 37.47719, 'lng': 126.89853},
     107: {'lat': 37.523174, 'lng': 126.88373},
     108: {'lat': 37.486786, 'lng': 126.90441},
     109: {'lat': 37.526005, 'lng': 126.91095},
     110: {'lat': 37.52019, 'lng': 126.9149},
     111: {'lat': 37.516853, 'lng': 126.928375},
     112: {'lat': 37.511204, 'lng': 126.95347},
     113: {'lat': 37.49435, 'lng': 126.98292},
     114: {'lat': 37.479046, 'lng': 126.924255},
     115: {'lat': 37.47771, 'lng': 126.96224},
     116: {'lat': 37.476406, 'lng': 127.00445},
     117: {'lat': 37.49059, 'lng': 127.03116},
     118: {'lat': 37.503742, 'lng': 127.00778},
     119: {'lat': 37.49624, 'lng': 127.005554},
     120: {'lat': 37.49201, 'lng': 127.047966},
     121: {'lat': 37.49591, 'lng': 127.090904},
     122: {'lat': 37.46509, 'lng': 127.10564},
     123: {'lat': 37.529713, 'lng': 126.90928},
     124: {'lat': 37.50548, 'lng': 127.05213},
     125: {'lat': 37.51486, 'lng': 127.020096},
     126: {'lat': 37.51064, 'lng': 127.07856},
     127: {'lat': 37.500538, 'lng': 127.11144},
     128: {'lat': 37.520966, 'lng': 126.88183},
     129: {'lat': 37.506, 'lng': 126.97375},
     130: {'lat': 37.517002, 'lng': 126.97397},
     131: {'lat': 37.60868, 'lng': 126.99888},
     132: {'lat': 37.608555, 'lng': 127.052574},
     133: {'lat': 37.568684, 'lng': 127.07602},
     134: {'lat': 37.493134, 'lng': 127.02253},
     135: {'lat': 37.497646, 'lng': 127.0872},
     136: {'lat': 37.449097, 'lng': 126.92617},
     137: {'lat': 37.520966, 'lng': 126.88183},
     138: {'lat': 37.52932, 'lng': 126.862274}
}

FEATURE_COLUMNS = [
    'Station_Number', 'Direction', 'Latitude', 'Longitude',
    'Hour', 'Weekday_Weekend', 'Year', 'Month', 'Day_of_Week_Num'
]

@app.route('/predict_traffic', methods=['POST'])
def predict():
    try:
        req_data = request.get_json(force=True)
        station_num = int(req_data.get('Station_Number'))

        station_info = STATION_MAP.get(station_num)
        if not station_info:
            return jsonify({'success': False, 'error': '존재하지 않는 스테이션입니다.'}), 400

        predictions_list = []
        now = datetime.datetime.now()

        # 현재 시간부터 향후 6시간 예측 (원하는 만큼 숫자 조절 가능)
        for i in range(6):
            future_time = now + datetime.timedelta(hours=i)

            year = future_time.year
            month = future_time.month
            hour = future_time.hour
            day_of_week = future_time.weekday()  # 월=0, 일=6
            weekday_weekend = 1 if day_of_week < 5 else 0  # 평일 1, 주말 0

            hour_results = {
                'time': future_time.strftime('%Y-%m-%d %H:00'),
                'hour': hour,
                'direction_0': 0,
                'direction_1': 0
            }

            # 각 시간대별로 Direction 0, 1 모두 예측
            for direction in [0, 1]:
                input_data = {
                    'Station_Number': station_num,
                    'Direction': direction,
                    'Latitude': station_info['lat'],
                    'Longitude': station_info['lng'],
                    'Hour': hour,
                    'Weekday_Weekend': weekday_weekend,
                    'Year': year,
                    'Month': month,
                    'Day_of_Week_Num': day_of_week
                }

                input_df = pd.DataFrame([input_data], columns=FEATURE_COLUMNS)
                pred_value = model.predict(input_df)[0]
                hour_results[f'direction_{direction}'] = float(pred_value)

            predictions_list.append(hour_results)

        return jsonify({
            'success': True,
            'station_number': station_num,
            'forecast': predictions_list
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)