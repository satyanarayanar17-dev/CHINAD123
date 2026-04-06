import { api } from './client';

export class DraftConflictError extends Error {
  constructor(message: string = 'Draft conflict detected. Another session has modified this file.') {
    super(message);
    this.name = 'DraftConflictError';
  }
}

// In-memory local cache purely to track HTTP specification (ETag + If-Match)
// This strictly decouples Concurrency mechanisms from the React State Tree.
const draftETags = new Map<string, string>();

export const draftsApi = {
  getDraft: async <T>(key: string): Promise<T | null> => {
    try {
      const response = await api.get<T>(`/drafts/${key}`);
      
      // Cache the version tag if the server provides it
      if (response.headers['etag']) {
        draftETags.set(key, response.headers['etag']);
      }
      
      return response.data;
    } catch {
      return null; // Graceful fallback if draft not found or network fails
    }
  },
  
  saveDraft: async <T>(key: string, data: T): Promise<void> => {
    const etag = draftETags.get(key);
    const headers = etag ? { 'If-Match': etag } : undefined;
    
    try {
      const response = await api.put(`/drafts/${key}`, data, { headers });
      
      // Re-cache newly returned ETag to allow continuous debounced writes
      if (response.headers['etag']) {
        draftETags.set(key, response.headers['etag']);
      }
    } catch (error: any) {
      if (error.response?.status === 412 || error.response?.status === 409) {
        throw new DraftConflictError();
      }
      throw error;
    }
  },
  
  clearDraft: async (key: string): Promise<void> => {
    await api.delete(`/drafts/${key}`);
    draftETags.delete(key);
  }
};
