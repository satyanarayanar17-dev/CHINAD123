const { randomUUID } = require('node:crypto');

async function writePrescriptionItems(tx, { prescriptionId, prescriptionVersion, medications, actorId, createdAt }) {
  const rows = [];
  for (let ordinal = 0; ordinal < medications.length; ordinal++) {
    const medication = medications[ordinal];
    const row = {
      id: `rxitem-${randomUUID()}`,
      prescription_id: prescriptionId,
      prescription_version: prescriptionVersion,
      ordinal,
      drug_id: medication.drug_id,
      dose: medication.dose,
      frequency: medication.frequency,
      duration: medication.duration,
      instructions: medication.instructions || ''
    };
    await tx.run(
      `INSERT INTO prescription_items
       (id,prescription_id,prescription_version,ordinal,drug_id,dose,frequency,duration,instructions,created_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [row.id, row.prescription_id, row.prescription_version, row.ordinal, row.drug_id, row.dose, row.frequency, row.duration, row.instructions, actorId, createdAt]
    );
    rows.push(row);
  }
  const stored = await tx.all(
    `SELECT prescription_id,prescription_version,ordinal,drug_id,dose,frequency,duration,instructions
     FROM prescription_items WHERE prescription_id=? AND prescription_version=? ORDER BY ordinal`,
    [prescriptionId, prescriptionVersion]
  );
  const expected = rows.map(({ id, ...row }) => row);
  if (JSON.stringify(stored) !== JSON.stringify(expected)) throw new Error('PRESCRIPTION_ITEM_INTEGRITY_FAILURE');
  return rows;
}

module.exports = { writePrescriptionItems };
