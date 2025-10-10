<?php
// post.php
declare(strict_types=1);

header('Content-Type: application/json; charset=UTF-8');

/* =========================
   PHPMailer (ileride geri dönüş için bırakıldı)
   ========================= */
// use PHPMailer\PHPMailer\PHPMailer;
// use PHPMailer\PHPMailer\Exception;
// require __DIR__ . '/vendor/autoload.php';

// ——— MAIL AYARLARI ———
const MAIL_FROM        = 'no-reply@thehouse.party';
const MAIL_FROM_NAME   = 'The House Party';
//const MAIL_TO          = 'jade@thehouse.party'; // alıcı (gerekirse çoğaltın)
const MAIL_TO          = 'events@thehouse.party'; // alıcı (gerekirse çoğaltın)

const MAIL_SUBJECT_PREFIX = 'New Enquiry • ';

// Yalnızca POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success'=>false, 'message'=>'Invalid request method.']);
    exit;
}

// Güvenli alım helper
function p(string $key): string {
    return trim((string)($_POST[$key] ?? ''));
}
function esc(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

// Header enjeksiyonunu önlemek için From/Reply-To alanlarını temizle
function sanitize_header_value(string $v): string {
    return str_replace(["\r", "\n"], '', $v);
}

function guests_error(string $value, int $minRequired): ?string {
    if ($value === '') {
        return null;
    }
    if (!ctype_digit($value)) {
        return 'Guests must be a non-negative number.';
    }
    if ((int)$value < $minRequired) {
        return 'Guests must be at least ' . $minRequired . '.';
    }
    return null;
}

$eventDate  = p('eventDate');
$eventType  = strtolower(p('eventType')); // brand|music|corporate|promoted|special

// Ortak alanlar (tekil)
$name       = p('name_any');
$email      = p('email_any');
$tel        = p('tel_any');

// B/M/C
$company    = p('company');
$guests     = p('guests');
$budget     = p('budget');
$about      = p('about');

// Promoted
$eventName  = p('eventName');
$social     = p('social');
$reason     = p('reason');

// Special
$occasion   = p('occasion');

$errors = [];

/* =========================
   VALIDASYON
   ========================= */
// Zorunlu ortak
if ($eventDate === '') {
    $errors['eventDate'] = 'Please select a date.';
}
if (!in_array($eventType, ['brand','music','corporate','promoted','special'], true)) {
    $errors['eventType'] = 'Please choose a valid event type.';
}
if ($name === '') {
    $errors['name_any'] = 'Please enter your name.';
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email_any'] = 'Please enter a valid email.';
}

// UK phone (basit kontrol: +44 => 11–12, 0 => 10–11 digit)
$telDigits = preg_replace('/\D+/', '', $tel);
$telOK = (str_starts_with($telDigits, '44') && strlen($telDigits) >= 11 && strlen($telDigits) <= 12)
      || (str_starts_with($telDigits, '0')  && strlen($telDigits) >= 10 && strlen($telDigits) <= 11);
if ($tel === '' || !$telOK) {
    $errors['tel_any'] = 'Please enter a valid UK phone number.';
}

// Tür bazlı kontroller
if (in_array($eventType, ['brand','music','corporate'], true)) {
    // guests: non-negative integer
    $guestErr = guests_error($guests, 60);
    if ($guestErr !== null) {
        $errors['guests'] = $guestErr;
    }
    // budget: non-negative integer (sadece rakam)
    $budgetDigits = preg_replace('/\D+/', '', $budget);
    if ($budget !== '' && !ctype_digit($budgetDigits)) {
        $errors['budget'] = 'Budget must be a non-negative number.';
    }
    // about: 500–800 chars
    $len = mb_strlen($about);
    if ($len > 800) {
        $errors['about'] = 'Please use max 800 characters.';
    }
}
if ($eventType === 'promoted') {
    if ($eventName === '') { $errors['eventName'] = 'Please enter the event name.'; }
    
    // reason 500–800
    $rlen = mb_strlen($reason);
    if ($rlen > 800) {
        $errors['reason'] = 'Please use max 800 characters.';
    }
}
if ($eventType === 'special') {
    if (!in_array($occasion, ['Birthday','Hen or Stag','Corporate Event','Something Else'], true)) {
        $errors['occasion'] = 'Please choose an occasion.';
    }
}

// Hata varsa dön
if (!empty($errors)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Validation failed. Please check the highlighted fields.',
        'errors'  => $errors
    ]);
    exit;
}

/* =========================
   HTML BODY / ALT BODY
   ========================= */
$subject = MAIL_SUBJECT_PREFIX . strtoupper($eventType) . ' • ' . ($eventDate ?: date('Y-m-d'));

$rows = [];
$add = function(string $label, string $value) use (&$rows){
    if ($value === '') return;
    $rows[] = sprintf(
        '<tr>
           <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#444;">%s</td>
           <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#111;"><strong>%s</strong></td>
         </tr>',
        esc($label), nl2br(esc($value))
    );
};

// Ortak
$add('Event Date',  $eventDate);
$add('Type of Event', ucfirst($eventType));
$add('Name',        $name);
$add('Email',       $email);
$add('Tel (UK)',    $tel);

// Tür bazlı
if (in_array($eventType, ['brand','music','corporate'], true)) {
    $add('Company',     $company);
    $add('Guests',      $guests);
    $add('Budget (£)',  preg_replace('/\D+/', '', $budget));
    $add('About',       $about);
}
if ($eventType === 'promoted') {
    $add('Event Name',  $eventName);
    $add('Social',      $social);
    $add('Reason',      $reason);
}
if ($eventType === 'special') {
    $add('Occasion',    $occasion);
}

$table = implode('', $rows);

$body = <<<HTML
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="x-apple-disable-message-reformatting">
<title>{$subject}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#111;">
  <div style="max-width:640px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.08);">
    <div style="background:#000;color:#f3ab0e;padding:24px 28px;">
      <h1 style="margin:0;font-size:20px;letter-spacing:.5px">THE HOUSE PARTY</h1>
      <div style="color:#fff;margin-top:6px;font-size:14px;opacity:.9;">New enquiry received</div>
    </div>

    <div style="padding:8px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        {$table}
      </table>
    </div>

    <div style="padding:18px 28px;background:#fafafa;color:#666;font-size:12px">
      This email was generated by the hire the house page enquiry form.
    </div>
  </div>
</body>
</html>
HTML;

$altBody = "New enquiry:\n"
         . "Event Date: {$eventDate}\n"
         . "Type: {$eventType}\n"
         . "Name: {$name}\n"
         . "Email: {$email}\n"
         . "Tel: {$tel}\n";

/* =========================
   GÖNDERİM — mail()
   (PHPMailer bloğu aşağıda yorum satırı)
   ========================= */

// Başlıklar
$fromNameSafe = sanitize_header_value(MAIL_FROM_NAME);
$fromSafe     = sanitize_header_value(MAIL_FROM);
$replyToSafe  = sanitize_header_value($email);

// HTML mail için header
$headers  = "MIME-Version: 1.0\r\n";
$headers .= "Content-Type: text/html; charset=UTF-8\r\n";
$headers .= "From: {$fromNameSafe} <{$fromSafe}>\r\n";
if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $headers .= "Reply-To: ".esc($name ?: $email)." <{$replyToSafe}>\r\n";
}
$headers .= "X-Mailer: PHP/".phpversion();

// Bazı sunucular için envelope-from parametresi (opsiyonel)
// $params = '-f '.esc(MAIL_FROM);
$params = null;

// Gönder
$ok = false;
try {
    if ($params) {
        $ok = @mail(MAIL_TO, $subject, $body, $headers, $params);
    } else {
        $ok = @mail(MAIL_TO, $subject, $body, $headers);
    }
} catch (Throwable $e) {
    $ok = false;
}

if ($ok) {
    echo json_encode([
        'success' => true,
        'message' => 'Thank you! Your enquiry has been sent.'
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Mail could not be sent.',
        'errors'  => ['_mail' => 'mail() returned false']
    ]);
}

/* =========================
   PHPMailer BLOĞU (yorumlu)
   =========================
try {
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host       = SMTP_HOST;
    $mail->SMTPAuth   = true;
    $mail->Username   = SMTP_USER;
    $mail->Password   = SMTP_PASS;
    $mail->Port       = SMTP_PORT;
    $mail->SMTPSecure = SMTP_SECURE;

    $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
    $mail->addAddress(MAIL_TO);
    if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $mail->addReplyTo($email, $name ?: $email);
    }

    $mail->Subject = $subject;
    $mail->isHTML(true);
    $mail->Body    = $body;
    $mail->AltBody = $altBody;

    $mail->send();

    echo json_encode([
        'success' => true,
        'message' => 'Thank you! Your enquiry has been sent.'
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Mail could not be sent.',
        'errors'  => ['_mail' => $mail->ErrorInfo ?? $e->getMessage()]
    ]);
}
*/
