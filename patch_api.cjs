const fs = require('fs');
let content = fs.readFileSync('src/api/patientPortal.ts', 'utf8');
content = content.replace(
`};
  static async getCarePlanAdherence(patientId: string): Promise<any> {
    return (await api.get(\`/opd/adherence/\${patientId}/today\`)).data;
  }
  static async getCarePlanTimeline(patientId: string): Promise<any> {
    return (await api.get(\`/opd/adherence/\${patientId}/timeline\`)).data;
  }
  static async recordAdherence(adherenceId: string, payload: any): Promise<any> {
    return (await api.post(\`/opd/adherence/\${adherenceId}/record\`, payload)).data;
  }`,
`
  fetchCarePlanAdherence: async (patientId: string): Promise<any[]> => {
    return (await api.get(\`/opd/adherence/\${patientId}/today\`)).data;
  },
  fetchCarePlanTimeline: async (patientId: string): Promise<any[]> => {
    return (await api.get(\`/opd/adherence/\${patientId}/timeline\`)).data;
  },
  recordAdherence: async (adherenceId: string, payload: any): Promise<any> => {
    return (await api.post(\`/opd/adherence/\${adherenceId}/record\`, payload)).data;
  }
};
`
);
fs.writeFileSync('src/api/patientPortal.ts', content);
