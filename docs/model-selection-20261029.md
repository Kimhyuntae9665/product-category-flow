# 텍스트 자체 모델·이미지 API 선택 · 2026.10.29

사용자 요청: 1단계는 전체 500만 개가 최소 1회 통과하므로 자체 학습 텍스트 모델 설계와 이유를 명시. 3단계는 이미지 이해 능력과 비용을 조사해 모델명을 넣기.

## 현재 선택 변경 · 2026.10.29

사용자의 명시적 선택에 따라 현재 3단계 가성비 기준 모델을 **Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`)**로 변경했다. 공식 모델 문서에서 이미지·텍스트 입력 지원을 재확인했고, 표준 요금은 100만 토큰당 입력 $0.30 / 출력 $2.50이다. Google 공개 CharXiv 평가는 74.5%(High 설정, 도구 미사용)이며 실제 상품 분류 성능 측정값은 아니다. 화면의 두 모델 카드, 선택 근거·요금표, AI 기여 설명과 정적 설계 그림을 일치시켰다. 3.1은 단가가 더 낮은 비교 후보로만 남긴다.

- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/pricing
- https://deepmind.google/models/model-cards/gemini-3-5-flash-lite/

## 최초 조사 당시 결정 (변경 전 기록)

1단계: 사전학습한 소형 텍스트 모델을 상품 텍스트·정답으로 추가 학습하고 직접 운영하는 설계. 호출당 외부 API 비용을 줄이려는 목적이며, 정제·학습·서버·유지보수 비용도 비교. 학습 완료나 검증된 절감 실적을 주장하지 않음.

3단계: Gemini 3.1 Flash-Lite 우선 추천(확정 성능 우승이 아닌 도입 전 후보). Google 공개 High 설정의 MMMU-Pro 76.8%, CharXiv73.2%. 3.5FlashLite CharXiv74.5%로 1.3%p 높지만 표준 입력/출력 단가가 0.30/2.50으로3.1의0.25/1.50보다 높음. Qwen3-VL-Flash는 싱가포르 International 입력32K이하 0.05/0.40으로 더 저렴하며 동일 상품 분류 정확도 비교는 미확보. 제조사 평가와 가격으로 내린 추천 추론이며, 상품 분류 객관적 최고를 입증하지 않음. GPT5.4nano 공식 페이지는 Deprecated 상태여서 신규 우선 후보에서 제외.

표준 USD/100만토큰, 캐시/Batch 할인 제외. 입력 토큰에 이미지 포함; 해상도·토크나이저·추론 토큰에 따라 요청당 비용 달라짐. 1·2단계에서 미해결된 실제 상품의 별도 정답 표본으로 최종 세부분류 정확도, 오확정률, 사람 검수량, 지연, 전체 비용을 비교한 뒤 채택해야 함.

## 직접 확인한 공식 출처

- https://deepmind.google/models/model-cards/gemini-3-1-flash-lite/ : MMMU-Pro76.8,CharXiv73.2, High설정 비교
- https://deepmind.google/models/model-cards/gemini-3-5-flash-lite/ : CharXiv74.5, 3.1비교73.2
- https://deepmind.google/models/evals-methodology/gemini-3-5-flash-lite/ : High설정, CharXiv자체평가
- https://ai.google.dev/gemini-api/docs/pricing : 3.1입력0.25/출력1.50,3.5입력0.30/출력2.50
- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite : stable gemini-3.1-flash-lite, 이미지입력·구조화출력 지원
- https://www.alibabacloud.com/help/en/model-studio/model-pricing : Qwen3VLFlash Singapore International 32K이하0.05/0.40
- https://developers.openai.com/api/docs/models/gpt-5.4-nano : Deprecated

## 반영과 확인

work/landing-ui/landing.html의1단계·3단계카드, 모델선택기준details(비교표·출처·한계). 동일 단계인 독립검토 예시 첫판정의Codex표기를Gemini로 맞춤. landing.js는 첫판정 표시문구 한 곳만 변경; 계산·경로규칙 변경 없음. 소규모 관련 문구·조사 결합 작업으로 루트 직접 처리. cascade/blind-review 기존 검사 통과. 빌드·diff 검사. 현재 Work설정에서 로컬 브라우저 사용 비활성화(CUA getTab실제오류)라 육안 렌더검수·새스크린샷 미확보; 다른 기술로 우회하지 않음.
