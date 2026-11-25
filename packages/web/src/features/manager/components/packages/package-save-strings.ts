const en = {
  title: "Save to your Tadazz account",
  intro: "Review the selected game and theme, then save them to your account.",
  loading: "Checking this save request…",
  failed: "This save request could not be loaded. Check its status again.",
  expired:
    "This request or account session has expired. Sign in again and reopen the request.",
  ready: "Ready to save",
  notReady:
    "This package is not ready to save yet. Check its status again after the preview is ready.",
  contents: "Selected contents",
  game: "Game",
  theme: "Theme",
  save: "Save to my account",
  saving: "Saving…",
  saved: "Saved to your account.",
  uncertain:
    "The save result could not be confirmed. Check the status before trying again.",
  check: "Check status",
  preview: "Back to preview",
  studio: "Back to Studio",
  games: "Open my games",
  revision: "Revision",
  expires: "Available until",
}
type Texts = Record<keyof typeof en, string>

const translations: Record<string, Texts> = {
  en,
  he: {
    title: "שמירה בחשבון Tadazz שלך",
    intro: "בדקו את המשחק ואת ערכת הנושא שנבחרו, ואז שמרו אותם בחשבון.",
    loading: "בודק את בקשת השמירה…",
    failed: "לא ניתן לטעון את בקשת השמירה. בדקו שוב את מצבה.",
    expired: "תוקף הבקשה או החיבור לחשבון פג. התחברו שוב ופתחו את הבקשה מחדש.",
    ready: "מוכן לשמירה",
    notReady:
      "החבילה עדיין אינה מוכנה לשמירה. בדקו שוב את מצבה לאחר שהתצוגה המקדימה תהיה מוכנה.",
    contents: "התוכן שנבחר",
    game: "משחק",
    theme: "ערכת נושא",
    save: "שמירה בחשבון שלי",
    saving: "שומר…",
    saved: "נשמר בחשבון שלך.",
    uncertain: "לא ניתן לאמת את תוצאת השמירה. בדקו את המצב לפני ניסיון נוסף.",
    check: "בדיקת מצב",
    preview: "חזרה לתצוגה המקדימה",
    studio: "חזרה לסטודיו",
    games: "פתיחת המשחקים שלי",
    revision: "גרסה",
    expires: "זמין עד",
  },
  fr: {
    title: "Enregistrer dans votre compte Tadazz",
    intro:
      "Vérifiez le jeu et le thème sélectionnés, puis enregistrez-les dans votre compte.",
    loading: "Vérification de la demande…",
    failed: "Impossible de charger cette demande. Vérifiez à nouveau son état.",
    expired:
      "Cette demande ou session a expiré. Reconnectez-vous et rouvrez la demande.",
    ready: "Prêt à enregistrer",
    notReady:
      "Ce paquet n’est pas encore prêt. Vérifiez son état lorsque l’aperçu sera disponible.",
    contents: "Contenu sélectionné",
    game: "Jeu",
    theme: "Thème",
    save: "Enregistrer dans mon compte",
    saving: "Enregistrement…",
    saved: "Enregistré dans votre compte.",
    uncertain:
      "Le résultat n’a pas pu être confirmé. Vérifiez l’état avant de réessayer.",
    check: "Vérifier l’état",
    preview: "Retour à l’aperçu",
    studio: "Retour au Studio",
    games: "Ouvrir mes jeux",
    revision: "Révision",
    expires: "Disponible jusqu’au",
  },
  de: {
    title: "In deinem Tadazz-Konto speichern",
    intro:
      "Prüfe das ausgewählte Spiel und Design und speichere sie in deinem Konto.",
    loading: "Speicheranfrage wird geprüft…",
    failed:
      "Diese Anfrage konnte nicht geladen werden. Prüfe den Status erneut.",
    expired:
      "Diese Anfrage oder Sitzung ist abgelaufen. Melde dich erneut an und öffne die Anfrage.",
    ready: "Bereit zum Speichern",
    notReady:
      "Dieses Paket ist noch nicht bereit. Prüfe den Status erneut, sobald die Vorschau verfügbar ist.",
    contents: "Ausgewählte Inhalte",
    game: "Spiel",
    theme: "Design",
    save: "In meinem Konto speichern",
    saving: "Wird gespeichert…",
    saved: "In deinem Konto gespeichert.",
    uncertain:
      "Das Ergebnis konnte nicht bestätigt werden. Prüfe den Status, bevor du es erneut versuchst.",
    check: "Status prüfen",
    preview: "Zurück zur Vorschau",
    studio: "Zurück zum Studio",
    games: "Meine Spiele öffnen",
    revision: "Revision",
    expires: "Verfügbar bis",
  },
  es: {
    title: "Guardar en tu cuenta de Tadazz",
    intro: "Revisa el juego y el tema seleccionados y guárdalos en tu cuenta.",
    loading: "Comprobando la solicitud…",
    failed: "No se pudo cargar esta solicitud. Comprueba su estado de nuevo.",
    expired:
      "La solicitud o la sesión ha caducado. Inicia sesión y abre la solicitud de nuevo.",
    ready: "Listo para guardar",
    notReady:
      "Este paquete aún no está listo. Comprueba su estado cuando la vista previa esté disponible.",
    contents: "Contenido seleccionado",
    game: "Juego",
    theme: "Tema",
    save: "Guardar en mi cuenta",
    saving: "Guardando…",
    saved: "Guardado en tu cuenta.",
    uncertain:
      "No se pudo confirmar el resultado. Comprueba el estado antes de volver a intentarlo.",
    check: "Comprobar estado",
    preview: "Volver a la vista previa",
    studio: "Volver a Studio",
    games: "Abrir mis juegos",
    revision: "Revisión",
    expires: "Disponible hasta",
  },
  it: {
    title: "Salva nel tuo account Tadazz",
    intro:
      "Controlla il gioco e il tema selezionati, poi salvali nel tuo account.",
    loading: "Verifica della richiesta…",
    failed:
      "Impossibile caricare questa richiesta. Controlla di nuovo lo stato.",
    expired:
      "La richiesta o la sessione è scaduta. Accedi di nuovo e riapri la richiesta.",
    ready: "Pronto per il salvataggio",
    notReady:
      "Il pacchetto non è ancora pronto. Ricontrolla lo stato quando l’anteprima sarà disponibile.",
    contents: "Contenuti selezionati",
    game: "Gioco",
    theme: "Tema",
    save: "Salva nel mio account",
    saving: "Salvataggio…",
    saved: "Salvato nel tuo account.",
    uncertain:
      "Impossibile confermare il risultato. Controlla lo stato prima di riprovare.",
    check: "Controlla stato",
    preview: "Torna all’anteprima",
    studio: "Torna a Studio",
    games: "Apri i miei giochi",
    revision: "Revisione",
    expires: "Disponibile fino al",
  },
  ja: {
    title: "Tadazzアカウントに保存",
    intro:
      "選択したゲームとテーマを確認してから、アカウントに保存してください。",
    loading: "保存リクエストを確認しています…",
    failed:
      "リクエストを読み込めませんでした。状態をもう一度確認してください。",
    expired:
      "リクエストまたはログインの有効期限が切れました。再度ログインして開き直してください。",
    ready: "保存できます",
    notReady:
      "まだ保存できません。プレビューの準備ができてから状態を確認してください。",
    contents: "選択した内容",
    game: "ゲーム",
    theme: "テーマ",
    save: "アカウントに保存",
    saving: "保存しています…",
    saved: "アカウントに保存しました。",
    uncertain:
      "保存結果を確認できませんでした。再試行する前に状態を確認してください。",
    check: "状態を確認",
    preview: "プレビューに戻る",
    studio: "Studioに戻る",
    games: "自分のゲームを開く",
    revision: "リビジョン",
    expires: "有効期限",
  },
  tr: {
    title: "Tadazz hesabınıza kaydedin",
    intro: "Seçilen oyunu ve temayı inceleyin, ardından hesabınıza kaydedin.",
    loading: "Kaydetme isteği kontrol ediliyor…",
    failed: "Bu istek yüklenemedi. Durumunu yeniden kontrol edin.",
    expired:
      "İsteğin veya oturumun süresi doldu. Tekrar giriş yapıp isteği açın.",
    ready: "Kaydetmeye hazır",
    notReady:
      "Bu paket henüz hazır değil. Önizleme hazır olduğunda durumunu yeniden kontrol edin.",
    contents: "Seçilen içerikler",
    game: "Oyun",
    theme: "Tema",
    save: "Hesabıma kaydet",
    saving: "Kaydediliyor…",
    saved: "Hesabınıza kaydedildi.",
    uncertain:
      "Kaydetme sonucu doğrulanamadı. Tekrar denemeden önce durumu kontrol edin.",
    check: "Durumu kontrol et",
    preview: "Önizlemeye dön",
    studio: "Studio’ya dön",
    games: "Oyunlarımı aç",
    revision: "Revizyon",
    expires: "Son geçerlilik",
  },
  vi: {
    title: "Lưu vào tài khoản Tadazz của bạn",
    intro:
      "Kiểm tra trò chơi và chủ đề đã chọn, rồi lưu vào tài khoản của bạn.",
    loading: "Đang kiểm tra yêu cầu lưu…",
    failed: "Không thể tải yêu cầu này. Hãy kiểm tra lại trạng thái.",
    expired:
      "Yêu cầu hoặc phiên đăng nhập đã hết hạn. Hãy đăng nhập và mở lại yêu cầu.",
    ready: "Sẵn sàng lưu",
    notReady:
      "Gói này chưa sẵn sàng. Hãy kiểm tra lại khi bản xem trước đã sẵn sàng.",
    contents: "Nội dung đã chọn",
    game: "Trò chơi",
    theme: "Chủ đề",
    save: "Lưu vào tài khoản của tôi",
    saving: "Đang lưu…",
    saved: "Đã lưu vào tài khoản của bạn.",
    uncertain:
      "Chưa xác nhận được kết quả lưu. Hãy kiểm tra trạng thái trước khi thử lại.",
    check: "Kiểm tra trạng thái",
    preview: "Quay lại bản xem trước",
    studio: "Quay lại Studio",
    games: "Mở trò chơi của tôi",
    revision: "Bản sửa đổi",
    expires: "Có hiệu lực đến",
  },
}

export function packageSaveText(language: string): Texts {
  return translations[language.split("-")[0] ?? "en"] ?? en
}
