// Upload page script (SPEC-001, AC-14). Sends each file as the raw request body
// and shows the server's message. Messages are rendered with textContent (SEC-5).
const form = document.getElementById('upload-form');
const input = document.getElementById('file-input');
const button = document.getElementById('upload-button');
const messages = document.getElementById('messages');

// Mirrors MAX_FILE_BYTES in src/config.js. Oversized files are rejected here
// without being sent, so the user always gets the size message rather than a
// connection error; the server still enforces the limit (BR-3, SEC-2).
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function showMessage(text, ok) {
  const item = document.createElement('li');
  item.className = ok ? 'success' : 'error';
  item.textContent = text;
  messages.prepend(item);
}

async function uploadFile(file) {
  if (file.size > MAX_FILE_BYTES) {
    showMessage(`Upload failed: "${file.name}" is larger than the 2 MB limit.`, false);
    return;
  }
  try {
    const res = await fetch('/api/uploads', {
      method: 'POST',
      headers: { 'X-File-Name': encodeURIComponent(file.name), 'Content-Type': 'application/pdf' },
      body: file,
    });
    const data = await res.json();
    showMessage(data.message, data.ok === true);
  } catch {
    showMessage(`Upload failed: "${file.name}" could not be sent. Check your connection and try again.`, false);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const files = Array.from(input.files);
  if (files.length === 0) {
    showMessage('Please choose at least one PDF file to upload.', false);
    return;
  }
  button.disabled = true;
  for (const file of files) await uploadFile(file);
  button.disabled = false;
  form.reset();
});
