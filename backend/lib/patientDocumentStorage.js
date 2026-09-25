const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

class LocalPatientDocumentStorage {
  constructor(root = process.env.PATIENT_DOCUMENT_STORAGE_PATH || path.join(__dirname, '..', 'storage', 'patient-documents')) {
    this.root = path.resolve(root);
    this.provider = 'local-private';
  }

  async put(buffer) {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = crypto.randomBytes(32).toString('hex');
    await fs.writeFile(path.join(this.root, key), buffer, { mode: 0o600, flag: 'wx' });
    return { provider: this.provider, key };
  }

  async read(key) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('INVALID_STORAGE_KEY');
    return fs.readFile(path.join(this.root, key));
  }

  async remove(key) {
    if (!/^[a-f0-9]{64}$/.test(key)) return;
    await fs.rm(path.join(this.root, key), { force: true });
  }
}

module.exports = { patientDocumentStorage: new LocalPatientDocumentStorage(), LocalPatientDocumentStorage };
