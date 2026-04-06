import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '../../components/ui/Card';
import { Shield, UserPlus, ZapOff, CheckCircle, Key } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { adminApi } from '../../api/admin';
import type { User } from '../../api/admin';

export const UserManagement = () => {
  const { push } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const data = await adminApi.getUsers();
      setUsers(data);
    } catch (err: any) {
      push('error', 'Failed to load users', err.response?.data?.error?.message || err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleActive = async (user: User) => {
    try {
      if (user.is_active) {
        await adminApi.disableUser(user.id);
        push('success', 'User Disabled', `${user.name} has been deactivated.`);
      } else {
        await adminApi.enableUser(user.id);
        push('success', 'User Enabled', `${user.name} has been activated.`);
      }
      fetchUsers();
    } catch (err: any) {
      push('error', 'Action Failed', err.response?.data?.error?.message || err.message);
    }
  };

  const handleResetPassword = async (user: User) => {
    const newPass = prompt(`Enter new password for ${user.name} (min 8 chars):`);
    if (!newPass) return;
    try {
      await adminApi.resetPassword(user.id, newPass);
      push('success', 'Password Reset', `Password for ${user.name} has been updated.`);
    } catch (err: any) {
      push('error', 'Reset Failed', err.response?.data?.error?.message || err.message);
    }
  };

  const handleCreateUser = async () => {
    const id = prompt('Enter User ID (e.g., doc3_qa):');
    if (!id) return;
    const name = prompt('Enter Full Name:');
    if (!name) return;
    const role = prompt('Enter Role (NURSE, DOCTOR, ADMIN):')?.toUpperCase();
    if (!role || !['NURSE', 'DOCTOR', 'ADMIN'].includes(role)) {
      push('error', 'Invalid Role', 'Role must be NURSE, DOCTOR, or ADMIN');
      return;
    }
    const password = prompt('Enter Password (min 8 chars):');
    if (!password) return;

    try {
      await adminApi.createUser({ id, name, role, password });
      push('success', 'User Created', `${name} has been provisioned.`);
      fetchUsers();
    } catch (err: any) {
      push('error', 'Creation Failed', err.response?.data?.error?.message || err.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center w-full">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-tertiary" />
            <span>Staff Directory & Access</span>
          </div>
          <button
            onClick={handleCreateUser}
            className="flex items-center gap-1 text-[10px] uppercase font-bold bg-primary text-white px-2 py-1 rounded hover:bg-primary-dark transition"
          >
            <UserPlus size={12} />
            <span>Add Staff</span>
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-on-surface-variant flex justify-center p-4">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="text-sm text-on-surface-variant flex justify-center p-4">No users found.</div>
        ) : (
          users.map(user => (
            <div key={user.id} className="flex justify-between items-center border-b border-outline/20 pb-2">
              <div>
                <div className="text-sm font-bold flex items-center gap-2">
                  <span className={user.is_active ? 'text-on-surface' : 'text-on-surface-variant line-through'}>{user.name}</span>
                  <span className={`text-[9px] px-1 py-0.5 rounded uppercase font-bold ${
                    user.role === 'ADMIN' ? 'bg-tertiary/10 text-tertiary' :
                    user.role === 'DOCTOR' ? 'bg-primary/10 text-primary' :
                    'bg-secondary/10 text-secondary'
                  }`}>{user.role}</span>
                  {!user.is_active && <span className="text-[9px] text-error font-bold border border-error px-1 rounded uppercase">Disabled</span>}
                </div>
                <div className="text-xs text-on-surface-variant">ID: {user.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleResetPassword(user)}
                  title="Reset Password"
                  className="p-1.5 bg-outline/10 text-on-surface hover:text-primary rounded"
                >
                  <Key size={14} />
                </button>
                <button
                  onClick={() => handleToggleActive(user)}
                  title={user.is_active ? "Disable User" : "Enable User"}
                  className={`p-1.5 rounded ${user.is_active ? 'bg-error/10 text-error hover:bg-error hover:text-white' : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'}`}
                >
                  {user.is_active ? <ZapOff size={14} /> : <CheckCircle size={14} />}
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
