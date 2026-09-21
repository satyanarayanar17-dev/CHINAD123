const fs = require('fs');
const file = 'backend/routes/prescriptions.js';
let content = fs.readFileSync(file, 'utf8');

const injection = `
    // Auto-generate care plan tasks for prescriptions (OG Pilot Phase)
    try {
      let meds = [];
      try { 
        const parsed = JSON.parse(rx.rx_content); 
        if (parsed.newRx) meds.push(...parsed.newRx);
        if (parsed.activeMeds) meds.push(...parsed.activeMeds);
      } catch(e) {}
      
      if (meds.length > 0) {
        const { get, run, withTransaction } = require('../database');
        const { randomUUID } = require('crypto');
        await withTransaction(async (tx) => {
          let plan = await tx.get(\`SELECT id FROM care_plans WHERE patient_id = ? AND status = 'ACTIVE' LIMIT 1\`, [rx.patient_id]);
          if (!plan) {
            const planId = \`cp-\${Date.now()}-\${randomUUID().slice(0, 4)}\`;
            await tx.run(\`INSERT INTO care_plans (id, patient_id, doctor_id, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)\`, [planId, rx.patient_id, doctorId]);
            plan = { id: planId };
          }
          
          for (const m of meds) {
            const medName = String(m.name || m.drug || 'Medication');
            const type = medName.toLowerCase().includes('insulin') ? 'INSULIN' : 'MEDICATION';
            const title = \`\${medName} \${m.dose || ''}\`.trim();
            const freq = m.frequency || m.sig || 'As directed';
            const taskId = \`cpt-rx-\${Date.now()}-\${Math.floor(Math.random()*1000)}\`;
            await tx.run(\`INSERT INTO care_plan_tasks (id, plan_id, task_type, title, description, active) VALUES (?, ?, ?, ?, ?, 1)\`,
              [taskId, plan.id, type, title, freq]);
          }
        });
      }
    } catch(err) {
      console.error("Care plan auto-gen failed", err);
    }
`;

content = content.replace(
  "res.json({ message: 'Prescription officially authorized' });",
  injection + "\n    res.json({ message: 'Prescription officially authorized' });"
);

fs.writeFileSync(file, content);
