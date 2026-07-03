import { describe, it, expect } from 'vitest';
import { validateRemoteProfile } from '@/lib/remoteProfile.js';

describe('validateRemoteProfile', () => {
  it('exige host e user', () => {
    expect(validateRemoteProfile({ host: '', user: 'x', authType: 'agent', remoteDir: '/a' }).ok).toBe(false);
    expect(validateRemoteProfile({ host: 'h', user: '', authType: 'agent', remoteDir: '/a' }).ok).toBe(false);
  });
  it('exige keyPath quando authType=key', () => {
    expect(validateRemoteProfile({ host: 'h', user: 'x', authType: 'key', keyPath: '', remoteDir: '/a' }).ok).toBe(false);
    expect(validateRemoteProfile({ host: 'h', user: 'x', authType: 'key', keyPath: '/k', remoteDir: '/a' }).ok).toBe(true);
  });
  it('aceita perfil válido com agent', () => {
    expect(validateRemoteProfile({ host: 'h', user: 'x', authType: 'agent', remoteDir: '/srv' }).ok).toBe(true);
  });
});
