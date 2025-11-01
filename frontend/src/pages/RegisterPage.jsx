import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function RegisterPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const navigate = useNavigate();
    const usersApiUrl = '/api/usuarios_proxy';

    const handleRegister = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        try {
            const response = await fetch(`${usersApiUrl}/usuarios/registro`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha: password })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Erro ao tentar cadastrar.');
            }
            setSuccess('Cadastro realizado com sucesso! Redirecionando...');
            setTimeout(() => {
                navigate('/'); 
            }, 2000);

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
                <h1>Cadastro</h1>
                <p className={`message-area ${error ? 'error' : success ? 'success' : ''}`}>
                    {error || success}
                </p>
                <form id="register-form" onSubmit={handleRegister}>
                    <div className="form-group">
                        <label htmlFor="register-email">Email</label>
                        <input 
                            type="email" 
                            id="register-email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)} 
                            required 
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="register-password">Senha</label>
                        <input 
                            type="password" 
                            id="register-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)} 
                            required 
                        />
                    </div>
                    <button type="submit">Cadastrar</button>
                </form>
                <div className="switch-link">
                    <p>Já tem uma conta? <Link to="/">Faça o login</Link></p>
                </div>
                 <div className="switch-link">
                    <p>Ou <Link to="/catalog">veja o catálogo como visitante</Link></p>
                </div>
            </div>
        </div>
    );
}