'use strict';
const { namedPlaceDiagnostics } = require('../providers/namedPlaceDiagnostics');
const { createNamedPlaceEvidenceProvider } = require('../providers/namedPlaceEvidenceProvider');

test('preserves failure details without credentials, URLs, or requester IP', () => {
  const detail = namedPlaceDiagnostics(Object.assign(new Error('fallback'), {
    name: 'AxiosError', code: 'ERR_BAD_REQUEST', response: { status: 403,
      headers: { 'x-request-id': 'request-123' }, data: { error: { status: 'PERMISSION_DENIED', code: 403,
        message: 'key=secret at https://example.com/?key=secret IP address 2001:db8::1' } } },
  }));
  expect(detail).toMatchObject({ httpStatus: 403, apiStatus: 'PERMISSION_DENIED', apiCode: 403,
    exceptionClass: 'AxiosError', requestId: 'request-123' });
  expect(detail.message).not.toMatch(/secret|example.com|2001/);
});
test('logs lookup exceptions internally while keeping the public classification generic', async () => {
  const onDiagnostic = jest.fn();
  const error = Object.assign(new Error('This application is not authorized'), { googleStatus: 'REQUEST_DENIED', httpStatus: 200 });
  const provider = createNamedPlaceEvidenceProvider({ catalog: {}, lookup: async () => { throw error; }, onDiagnostic });
  await expect(provider.fetch(provider.buildRequest({ entity: { displayName: 'Offline Park' } }))).rejects.toBe(error);
  expect(onDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ httpStatus: 200, apiStatus: 'REQUEST_DENIED' }));
  expect(provider.classifyError(error)).toEqual({ code: 'provider_unavailable', retryable: false });
});
