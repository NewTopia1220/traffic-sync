/**
 * 교차로 위험도 계산 유틸
 * ------------------------------------------------------------------
 * 백엔드가 내려주는 riskScore(점수) / riskGrade(등급 1~4)를 화면 표현
 * (색상·라벨·퍼센트·정렬키)으로 변환한다.
 *
 * 등급 체계: 1=안전(초록) · 2=주의(노랑) · 3=위험(주황) · 4=심각(빨강)
 */
import { V } from "../constants/theme";

/** 속도값 → 혼잡 상태 문자열. 20 미만 혼잡 / 20~40 서행 / 40 이상 원활 */
export function statusOf(v) {
  if (v < 20) return "혼잡";
  if (v < 40) return "서행";
  return "원활";
}

/** 위험 점수가 유효한 숫자인지 */
export function hasRiskScore(score) {
  return Number.isFinite(score);
}

/** 등급 문자열을 정수로 파싱 (유효하지 않으면 null) */
export function riskGradeValue(grade) {
  const n = Number.parseInt(String(grade ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** 유효한 등급이 있는지 */
export function hasRiskGrade(grade) {
  return riskGradeValue(grade) != null;
}

/** 위험 점수를 0~100 막대 퍼센트로 변환 */
export function riskPercent(score) {
  if (!hasRiskScore(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

/** 등급별 색상 */
export function riskColor(score, grade) {
  switch (riskGradeValue(grade)) {
    case 1: return V.grn;
    case 2: return V.yel;
    case 3: return V.org;
    case 4: return V.red;
    default: return V.ink2;
  }
}

/** 등급별 한글 라벨 */
export function riskLevel(score, grade) {
  switch (riskGradeValue(grade)) {
    case 1: return "안전";
    case 2: return "주의";
    case 3: return "위험";
    case 4: return "심각";
    default: return hasRiskScore(score) ? "등급 대기" : "수집 대기";
  }
}

/**
 * 위험 순위 정렬키 — 등급 우선, 같은 등급이면 점수 순.
 * 등급이 없으면 -1로 맨 뒤로 밀린다.
 */
export function riskRank(item) {
  const grade = riskGradeValue(item?.riskGrade ?? item?.grade);
  const score = hasRiskScore(item?.riskScore ?? item?.score) ? (item.riskScore ?? item.score) : -1;
  return grade == null ? -1 : grade * 100000 + score;
}
