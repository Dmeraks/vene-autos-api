import { parsePermissionCode, permissionCode } from './permission-code';

describe('permissionCode', () => {
  it('formats resource and action', () => {
    expect(permissionCode('users', 'read')).toBe('users:read');
  });

  it('parses back', () => {
    expect(parsePermissionCode('settings:update')).toEqual({
      resource: 'settings',
      action: 'update',
    });
  });
});
