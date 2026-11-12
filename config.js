/* 설문 설정 — 이 파일만 고치면 설문 페이지와 관리자 페이지에 함께 적용됩니다. */
window.SURVEY_CONFIG = {
  // Google Apps Script 웹 앱 주소 (…/exec 로 끝남). 비워 두면 '미리보기 모드'로 동작하며 응답이 저장되지 않습니다.
  API_URL: 'https://script.google.com/macros/s/AKfycbxREyF96mQnNQBs8BzbtGzwObnwWsdRphUiXbW32_vEyUtsGWiVIrJgW-NlKKqD3BY_/exec',

  // 조사 주체 표시 (선택). 예: '한국공학대학교 OOO · 데이터 시각화 수업 과제'
  ORGANIZER: '한국공학대학교 황바람',

  // 문의처 (선택). 예: 'example@email.com'
  CONTACT: '',

  // 관리자 화면에서 국가별 목표 응답 수
  TARGET_PER_COUNTRY: 30
};
