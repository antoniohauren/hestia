import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, call } from '../api';
import { ErrorText } from '../components';

export function LoginPage() {
  const [pin, setPin] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const login = useMutation({
    mutationFn: () => call(api.auth.login.$post({ json: { pin } })),
    onSuccess: () => {
      qc.setQueryData(['me'], true);
      navigate('/', { replace: true });
    },
    onError: () => setPin(''),
  });
  return (
    <div className="login">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (pin) login.mutate();
        }}
      >
        <h1>Hestia</h1>
        <p className="muted">Ksa do Sushi</p>
        <label className="field">
          PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        <ErrorText error={login.error} />
        <button className="primary big" disabled={!pin || login.isPending}>
          Entrar
        </button>
      </form>
    </div>
  );
}
