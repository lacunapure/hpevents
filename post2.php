<?php
// post.php
declare(strict_types=1);

//ini_set('display_errors','1'); // TESTTE AÇIK TUTUN; PROD'DA KAPATIN
//error_reporting(E_ALL);

header('Content-Type: application/json; charset=UTF-8');

require_once __DIR__ . '/smtp/Exception.php';
require_once __DIR__ . '/smtp/PHPMailer.php';
require_once __DIR__ . '/smtp/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\SMTP;

// ——— CONFIG ———
const SMTP_HOST   = 'smtp.gmail.com';
const SMTP_USER   = 'events@thehouse.party';
const SMTP_PASS   = 'ukfkmbphzqnmjvse';
const SMTP_PORT   = 587;              // TLS
const SMTP_SECURE = PHPMailer::ENCRYPTION_STARTTLS;

const MAIL_FROM   = 'events@thehouse.party';
const MAIL_FROM_NAME = 'The House Party';
const MAIL_TO     = 'events@thehouse.party'; // alıcı


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
$eventType  = strtolower(p('eventType')); // brand|music|corporate|ticketedEvents|private

// Ortak alanlar (tekil)
$name       = p('name_any');
$email      = p('email_any');
$tel        = p('tel_any');

// B/M/C
$company    = p('company');
$guests     = p('guests');
$budget     = p('budget');
$about      = p('about');

// ticketedEvents
$eventName  = p('eventName');
$social     = p('social');
$reason     = p('reason');

// private
$occasion   = p('occasion');

$errors = [];

// ——— VALIDASYON ———
// Zorunlu ortak
if ($eventDate === '')            { $errors['eventDate'] = 'Please select a date.'; }
if (!in_array($eventType, ['brand','music','corporate','ticketedEvents','private'], true)) {
    $errors['eventType'] = 'Please choose a valid event type.';
}
if ($name === '')                 { $errors['name_any'] = 'Please enter your name.'; }
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email_any'] = 'Please enter a valid email.';
}

// UK phone (basit kontrol: +44 => 11–12, 0 => 10–11 digit)
$telDigits = preg_replace('/\D+/', '', $tel);
$telOK = (str_starts_with($telDigits, '44') && strlen($telDigits) >= 11 && strlen($telDigits) <= 12)
      || (str_starts_with($telDigits, '0')  && strlen($telDigits) >= 10 && strlen($telDigits) <= 11);
if ($tel === '' || !$telOK)       { $errors['tel_any'] = 'Please enter a valid UK phone number.'; }

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

if ($eventType === 'ticketedEvents') {
    if ($eventName === '') { $errors['eventName'] = 'Please enter the event name.'; }
    // reason 500–800
    $rlen = mb_strlen($reason);
    if ($rlen > 800) {
        $errors['reason'] = 'Please use max 800 characters.';
    }
}

if ($eventType === 'private') {
    if (!in_array($occasion, ['Birthday','Hen or Stag','Corporate Event','Something Else'], true)) {
        $errors['occasion'] = 'Please choose an occasion.';
    }
    $guestErr = guests_error($guests, 60);
    if ($guestErr !== null) {
        $errors['guests'] = $guestErr;
    }
}

if (!empty($errors)) {
    http_response_code(422);
    echo json_encode([
        'success' => false,
        'message' => 'Validation failed. Please check the highlighted fields.',
        'errors'  => $errors
    ]);
    exit;
}

// ——— E-POSTA HAZIRLIK ———
// ---- Yardımcılar ----
function esc(string $v): string {
  // htmlprivatechars() hatasının yerine kullanılacak güvenli fonksiyon
  return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$subject = 'New Enquiry • ' . mb_strtoupper($eventType, 'UTF-8') . ' • ' . ($eventDate ?: date('Y-m-d'));

$rows = [];
$add = function(string $label, string $value) use (&$rows){
    if ($value === '') return;
    $rows[] = sprintf(
        '<tr><td style="padding:10px 12px;border-bottom:1px solid #eee;color:#444;">%s</td><td style="padding:10px 12px;border-bottom:1px solid #eee;color:#111;"><strong>%s</strong></td></tr>',
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
if ($eventType === 'ticketedEvents') {
    $add('Event Name',  $eventName);
    $add('Social',      $social);
    $add('Reason',      $reason);
}
if ($eventType === 'private') {
    $add('Occasion',    $occasion);
    $add('Guests',      $guests);
}

$table = implode('', $rows);

// Basit modern HTML mail (inline CSS)
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
      This email was generated by the website enquiry form.
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

// ——— GÖNDERİM ———
try {
    $mail = new PHPMailer(true);
    $mail->CharSet  = 'UTF-8';   // <—
    $mail->Encoding = 'base64';  // <— gövdeleri base64 gönder (bazı istemciler için daha sağlam)

    $mail->isSMTP();
    $mail->Host       = SMTP_HOST;
    $mail->SMTPAuth   = true;
    $mail->Username   = SMTP_USER;
    $mail->Password   = SMTP_PASS;
    $mail->Port       = SMTP_PORT;
    $mail->SMTPSecure = SMTP_SECURE;

    $mail->setFrom(MAIL_FROM, MAIL_FROM_NAME);
    $mail->addAddress(MAIL_TO);
    // Reply-To kullanıcı olsun
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
