/**
 * 공통 디자인 토큰 (다크 테마)
 * ------------------------------------------------------------------
 * 인라인 스타일에서 색상/폰트를 일관되게 쓰기 위한 상수 맵.
 * MainDashboard, CctvDashboard 등 동일 팔레트를 쓰는 화면이 공유한다.
 * (Newsdashboard, LoginPage, MyPage는 키 구성이 달라 각자 로컬 정의를 유지)
 */
export const V = {
  // 배경 / 구분선
  bg0: "#000", bg1: "#0a0a0a", line: "#1a1a1a",
  // 텍스트 명도 단계 (0=밝음 → 3=어두움)
  ink0: "#e7ecf5", ink1: "#aab4c8", ink2: "#7a7a7a", ink3: "#3a3a3a",
  // 상태 색상
  grn: "#2ee07a", yel: "#facc15", red: "#ff5566", org: "#ffaa33", blu: "#4ea6ff",
  // 폰트
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
  sans: "'Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif",
};
