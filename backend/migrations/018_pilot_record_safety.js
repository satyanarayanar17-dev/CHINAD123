module.exports = {
  id: '018_pilot_record_safety',
  async up(context) {
    const columns = context.dialect === 'postgres'
      ? await context.all("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='patients'")
      : await context.all('PRAGMA table_info(patients)');
    for (const [name, type] of [
      ['allergy_review_status', "TEXT NOT NULL DEFAULT 'UNKNOWN'"],
      ['allergy_reviewed_at', 'TEXT'], ['allergy_reviewed_by', 'TEXT']
    ]) {
      if (!columns.some(column => column.name === name)) await context.run(`ALTER TABLE patients ADD COLUMN ${name} ${type}`);
    }
    // Existing free text remains unverified; migration does not assert a clinical review.
    await context.run("UPDATE patients SET allergy_review_status='RECORDED' WHERE COALESCE(allergies,'')!='' AND allergy_review_status='UNKNOWN'");
  }
};
