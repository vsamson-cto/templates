import { createApp } from './server.js';
import { DEFAULT_PORT, DEFAULT_UPLOAD_DIR } from './config.js';

createApp().listen(DEFAULT_PORT, () => {
  console.log(`PDF upload app listening on http://localhost:${DEFAULT_PORT}`);
  console.log(`Accepted files are stored in ${DEFAULT_UPLOAD_DIR}`);
});
