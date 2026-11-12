# 왜 한국이었나요? — website khảo sát du học sinh

Khảo sát 10 câu (tiếng Hàn / Anh / Việt / Trung) + trang admin, phục vụ bài "같은 유학, 다른 속도".

## Cấu trúc

| File | Vai trò |
| --- | --- |
| `index.html` | Trang khảo sát (người tham gia mở link này) |
| `admin.html` | Trang admin: xem kết quả, loại câu trả lời thử, tải CSV, backup |
| `config.js` | Nơi duy nhất cần sửa: địa chỉ API, tên người thực hiện |
| `backend/Code.gs` | API chạy trên Google Apps Script, lưu dữ liệu vào Google Sheets |

Cách hoạt động: trang web (GitHub Pages) gửi câu trả lời tới API (Apps Script). API kiểm tra rồi ghi vào Google Sheet của bạn. Mật khẩu admin chỉ nằm trên máy chủ của Google, không nằm trong file nào của website.

---

## Triển khai (khoảng 10 phút)

### Bước 1. Tạo nơi lưu dữ liệu và API

1. Vào <https://sheets.new> để tạo một Google Sheet mới. Đặt tên, ví dụ `why-korea-survey`.
2. Menu **확장 프로그램 (Extensions) → Apps Script**.
3. Xóa hết nội dung có sẵn, dán toàn bộ nội dung file `backend/Code.gs` vào, bấm lưu.
4. Bấm biểu tượng bánh răng **프로젝트 설정 (Project Settings)** → kéo xuống **스크립트 속성 (Script properties)** → **스크립트 속성 추가**:
   - 속성 (Property): `ADMIN_PASSWORD`
   - 값 (Value): `120113`
   - Bấm lưu.
5. Quay lại trình soạn code, chọn hàm **`setup`** ở thanh trên rồi bấm **실행 (Run)**. Google sẽ hỏi quyền truy cập Sheets và Drive: chọn tài khoản của bạn → *고급 (Advanced)* → *이동 (Go to …)* → *허용 (Allow)*.
   Sau bước này Sheet có 2 tab `responses` và `raw_log`, và Drive có thư mục `why-korea-survey-backups` với bản backup đầu tiên.
6. **배포 (Deploy) → 새 배포 (New deployment)** → loại **웹 앱 (Web app)**:
   - 다음 사용자 인증 정보로 실행 (Execute as): **나 (Me)**
   - 액세스 권한이 있는 사용자 (Who has access): **모든 사용자 (Anyone)**
   - Bấm **배포**, rồi sao chép **웹 앱 URL** (kết thúc bằng `/exec`).
7. Kiểm tra nhanh: dán URL đó vào trình duyệt. Nếu thấy `{"ok":true,"service":"why-korea-survey","open":true}` là API đã chạy.

### Bước 2. Nối website với API

Mở `config.js`, dán URL vào `API_URL`:

```js
API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
ORGANIZER: '한국공학대학교 OOO · 데이터 시각화 수업 과제',   // nên điền, xem mục Khuyến nghị
```

### Bước 3. Đưa website lên GitHub Pages

1. Tạo repository mới trên GitHub (Public), ví dụ `why-korea-survey`.
2. **Add file → Upload files**: kéo thả `index.html`, `admin.html`, `config.js`, `README.md` và thư mục `backend`.
3. **Settings → Pages → Build and deployment**: Source = *Deploy from a branch*, Branch = `main`, thư mục `/ (root)` → Save.
4. Sau 1–2 phút, link sẽ là:
   - Khảo sát: `https://<tên-github>.github.io/why-korea-survey/`
   - Admin: `https://<tên-github>.github.io/why-korea-survey/admin.html`

### Bước 4. Thử trước khi chia sẻ

1. Mở link khảo sát trên điện thoại, trả lời hết và gửi.
2. Mở Google Sheet: tab `responses` phải có 1 dòng mới.
3. Mở trang admin, nhập mật khẩu, bấm **제외** ở dòng vừa thử để loại nó khỏi thống kê.

---

## Chia sẻ link

Thêm `?src=...` vào cuối link để biết câu trả lời đến từ kênh nào (cột `src`):

- KakaoTalk: `.../why-korea-survey/?src=kakao`
- Zalo: `.../?src=zalo`
- WeChat: `.../?src=wechat`

## Backup

- **Tự động:** mỗi ngày lúc 3 giờ sáng, API sao chép toàn bộ Sheet vào thư mục Drive `why-korea-survey-backups` (giữ 30 bản gần nhất).
- **Thủ công:** nút **지금 백업** trên trang admin, hoặc nút **CSV 내려받기** để tải file về máy.
- **Bản gốc không bị sửa:** tab `raw_log` lưu nguyên văn từng câu trả lời (JSON), chỉ thêm chứ không sửa. Nếu lỡ tay xóa nhầm ở tab `responses` thì vẫn khôi phục được.
- **Lịch sử phiên bản:** trong Google Sheet, *파일 → 버전 기록* cho phép quay lại trạng thái cũ.
- **GitHub:** repository giữ mã nguồn. Không nên đẩy dữ liệu trả lời lên repository công khai.

## Khi sửa code API

Sau khi sửa `Code.gs`: **배포 → 배포 관리 (Manage deployments) → biểu tượng bút chì → 버전: 새 버전 → 배포**. Làm vậy thì URL giữ nguyên. Nếu tạo "새 배포" thì URL đổi và phải sửa lại `config.js`.

## Dùng dữ liệu cho dashboard

File CSV có một dòng cho mỗi người trả lời, tên cột `q1` … `q10`. Giá trị là mã cố định, không phụ thuộc ngôn ngữ người trả lời (ví dụ `q1` = `VN`/`CN`/`MN`/`NP`/`ETC`, `q5_1` = lý do xếp thứ nhất). Cột `excluded` = `1` là dòng đã loại; cột `flags` có `fast` (trả lời dưới 45 giây) hoặc `straight` (6 thanh trượt mức hài lòng giống hệt nhau).

---

## Khuyến nghị

1. **Điền `ORGANIZER` trong `config.js`.** Người tham gia tin tưởng hơn khi biết ai thực hiện khảo sát. Mình để trống vì đây là thông tin cá nhân của bạn hiển thị công khai.
2. **Mật khẩu `120113` khá yếu** (6 chữ số). API khóa 10 phút sau 8 lần nhập sai nên khó dò, nhưng nếu dữ liệu quan trọng thì nên đổi sang mật khẩu có chữ cái. Đổi ở *스크립트 속성*, không cần sửa code.
3. **Tiếng Mông Cổ và tiếng Nepal chưa có.** Bản dịch nên do người bản ngữ kiểm tra; khi có người kiểm tra giúp thì thêm vào rất nhanh.
4. **Nhờ 2–3 bạn làm thử trước** (pilot) để xem câu nào khó hiểu, rồi mới chia sẻ rộng. Nhớ bấm **제외** cho các câu trả lời thử.
5. **Mục tiêu 30 người mỗi nước.** Trang admin hiện tiến độ; nước nào dưới 30 thì so sánh giữa các nước chỉ nên ghi là "참고용".
6. **Đóng khảo sát khi xong** bằng nút **설문 닫기** trên trang admin, để số liệu không đổi sau khi bạn đã phân tích.
7. **Không ngăn tuyệt đối được việc một người trả lời hai lần** vì khảo sát ẩn danh, không đăng nhập. Website chặn theo trình duyệt; đổi máy hoặc xóa dữ liệu trình duyệt thì vẫn trả lời lại được.
