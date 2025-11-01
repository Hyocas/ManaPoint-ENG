import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    
    const navigate = useNavigate();
    const usersApiUrl = '/api/usuarios_proxy';

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(''); 

        try {
            const response = await fetch(`${usersApiUrl}/usuarios/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha: password })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Erro ao tentar fazer login.');
            }
            
            localStorage.setItem('authToken', data.token);
            navigate('/catalog');

        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <div className="container">
            <div className="auth-card">
                <div className="logo-container">
                    <img src="/logo-transparente.png" alt="Mana-Point Logo" className="logo-img" />
                </div>
                <h1>Login</h1>
                <p className={`message-area ${error ? 'error' : ''}`}>{error}</p>
                <form id="login-form" onSubmit={handleLogin}>
                    <div className="form-group">
                        <label htmlFor="login-email">Email</label>
                        <input 
                            type="email" 
                            id="login-email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required 
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="login-password">Senha</label>
                        <input 
                            type="password" 
                            id="login-password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required 
                        />
                    </div>
                    <button type="submit">Entrar</button>
                </form>
                <div className="switch-link">
                    <p>Não tem uma conta? <Link to="/register">Cadastre-se</Link></p>
                </div>
                <div className="switch-link">
                    <p>Ou <Link to="/catalog">veja o catálogo como visitante</Link></p>
                </div>
            </div>
        </div>
    );
}