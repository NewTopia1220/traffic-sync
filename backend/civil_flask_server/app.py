import os
import io
import json
import re
import traceback
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image
import pillow_heif
pillow_heif.register_heif_opener()

load_dotenv()

app = Flask(__name__)
CORS(app)

client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

# ── 카테고리 → 담당과 매핑 ──────────────────────────────────────────
DEPT_MAP = {
    "도로 파손/균열":    "도로과",
    "노면 침수/결빙":    "도로과",
    "횡단보도 파손":     "도로과",
    "신호등 오작동":     "교통과",
    "교통표지판 훼손":   "교통과",
    "공사구간 미표시":   "교통과",
    "불법 주정차":       "주차과",
    "가로등 불량/소등":  "시설과",
    "보행자 위험구간":   "시설과",
    "도로 청결 불량":    "환경미화과",
    "동물 사체":         "환경미화과",
    "이륜차 불법 운행":  "경찰서",
    "과속/난폭운전":     "경찰서",
    "소음/진동":         "환경과",
    "기타":              "민원과",
}

CATEGORIES = list(DEPT_MAP.keys())

PROMPT = """이 이미지는 서울시 교통 민원 신고 사진입니다.
제목 힌트: {title}

아래 카테고리 중 가장 적합한 하나를 골라 JSON으로만 응답하세요.
다른 텍스트는 절대 포함하지 마세요.

카테고리 목록:
{categories}

응답 형식:
{{"category": "카테고리명", "reason": "한 줄 이유"}}"""


@app.route("/api/civil/classify", methods=["POST"])
def classify():
    try:
        title = request.form.get("title", "")
        file  = request.files.get("image")

        if not file:
            return jsonify({"success": False, "message": "이미지가 없습니다."}), 400

        # 이미지 읽기 (HEIC/HEIF → JPEG 자동 변환)
        raw = file.read()
        fname = (file.filename or "").lower()
        is_heic = file.content_type in ("image/heic", "image/heif") or fname.endswith(".heic") or fname.endswith(".heif")
        converted_b64 = None
        if is_heic:
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85)
            img_bytes = buf.getvalue()
            mime_type = "image/jpeg"
            import base64
            converted_b64 = "data:image/jpeg;base64," + base64.b64encode(img_bytes).decode()
        else:
            img_bytes = raw
            mime_type = file.content_type or "image/jpeg"

        # Gemini Vision 호출 (bytes 방식)
        prompt = PROMPT.format(
            title=title or "없음",
            categories="\n".join(f"- {c}" for c in CATEGORIES)
        )
        image_part = types.Part.from_bytes(data=img_bytes, mime_type=mime_type)
        last_err = None
        response = None
        for model_id in ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash-lite"]:
            try:
                response = client.models.generate_content(
                    model=model_id,
                    contents=[prompt, image_part],
                )
                break
            except Exception as e:
                last_err = e
                err_str = str(e)
                if any(code in err_str for code in ["503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED"]):
                    continue
                raise
        if response is None:
            raise last_err
        raw = response.text.strip()

        # JSON 파싱 (마크다운 코드블록 제거)
        raw = re.sub(r"```json|```", "", raw).strip()
        data = json.loads(raw)

        category   = data.get("category", "기타")
        reason     = data.get("reason", "")
        department = DEPT_MAP.get(category, "민원과")

        return jsonify({
            "success":    True,
            "convertedImage": converted_b64,
            "category":   category,
            "department": department,
            "reason":     reason,
        })

    except json.JSONDecodeError as e:
        print("=== JSON 파싱 실패 ===", e)
        return jsonify({"success": False, "message": "AI 응답 파싱 실패"}), 500
    except Exception as e:
        print("=== 에러 발생 ===")
        traceback.print_exc()
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "civil-classifier"})

@app.route("/models", methods=["GET"])
def list_models():
    try:
        models = [m.name for m in client.models.list()]
        return jsonify({"models": models})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8002))
    print(f"민원 분류 서버 시작 — port {port}")
    app.run(host="0.0.0.0", port=port, debug=True)
