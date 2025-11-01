import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function CatalogPage() {
    const [cartas, setCartas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cardNameToAdd, setCardNameToAdd] = useState('');
    const [quantidadeToAdd, setQuantidadeToAdd] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [searching, setSearching] = useState(false);

    const navigate = useNavigate();
    const catalogApiUrl = '/api/catalogo_proxy';

    const token = localStorage.getItem('authToken');

    const fetchCatalog = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${catalogApiUrl}/cartas`);

            const data = await response.json();
            console.log('Resultado search:', data);

            if (!response.ok) throw new Error(data.message || 'Erro ao buscar carta.');

            let cards = Array.isArray(data) ? data : (data ? [data] : []);

            cards = cards
            .filter(c => c)
            .map(c => {
                if (c.id != null && typeof c.id === 'string' && /^\d+$/.test(c.id)) {
                return { ...c, id: Number(c.id) };
                }
                return c;
            })
            .filter(c => c.id != null);

            if (cards.length === 0) {
            alert('Nenhuma carta encontrada.');
            return;
            }

            setCartas(cards);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        fetchCatalog();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('authToken');
        navigate('/'); 
    };

    const handleAddCard = async (e) => {
        e.preventDefault();
        if (!cardNameToAdd.trim()) return;

        try {
            const response = await fetch(`${catalogApiUrl}/cartas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ nome: cardNameToAdd, quantidade: quantidadeToAdd })
            });
            
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Erro ao adicionar carta");

            setCardNameToAdd('');
            fetchCatalog();
        } catch (err) {
            alert(err.message);
        }
    };

    const handleDeleteCard = async (cardId, cardName) => {
        if (!confirm(`Tem certeza que deseja deletar a carta "${cardName}"?`)) return;

        try {
            const response = await fetch(`${catalogApiUrl}/cartas/${cardId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status !== 204) {
                 const data = await response.json();
                 throw new Error(data.message || 'Falha ao deletar a carta.');
            }
            fetchCatalog();
        } catch (err) {
            alert(err.message);
        }
    };
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchTerm.trim()) return;

        try {
            setSearching(true);
            const response = await fetch(`${catalogApiUrl}/cartas/search?nome=${encodeURIComponent(searchTerm)}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.message || 'Erro ao buscar carta.');

            setCartas(data);
        } catch (err) {
            alert(err.message);
        } finally {
            setSearching(false);
        }
    };

    if (loading) return <p>Carregando catálogo...</p>;
    if (error) return <p className="error">{error}</p>;

    return (
        <div className="catalog-page">
            <div className="catalog-header">
                <h2>Catálogo de Cartas</h2>
                <form 
                id="search-card-form" 
                onSubmit={handleSearch}
                style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}
                >
                <input
                    type="text"
                    placeholder="Pesquisar carta..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ flexGrow: 1 }}
                />
                <button type="submit" disabled={searching}>
                    {searching ? 'Buscando...' : 'Buscar'}
                </button>
                </form>
                <div id="header-nav" style={{ display: 'flex', gap: '10px' }}>
                    <Link to="/carrinho" className="nav-link">Ver Carrinho</Link>
                    {token ? (
                        <button id="logout-btn" onClick={handleLogout}>Logout</button>
                    ) : (
                        <Link to="/" className="nav-link">Fazer Login</Link>
                    )}
                </div>
            </div>

            {token && (
                <form 
                    id="add-card-form" 
                    onSubmit={handleAddCard} 
                    style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}
                >
                    <input 
                        type="text" 
                        style={{ flexGrow: 1 }}
                        placeholder="Buscar e adicionar carta pelo nome exato..."
                        value={cardNameToAdd}
                        onChange={(e) => setCardNameToAdd(e.target.value)}
                    />
                    <input
                        type="number"
                        min="1"
                        value={quantidadeToAdd}
                        onChange={(e) => setQuantidadeToAdd(Number(e.target.value))}
                        style={{ width: '80px' }}
                        placeholder="Qtd"
                    />
                    <button style={{ width: 'auto' }} type="submit">Adicionar</button>
                </form>
            )}

            <div id="catalog-container">
                {cartas.map(carta => (
                    <Link to={`/carta/${carta.id}`} key={carta.id} style={{textDecoration: 'none', color: 'inherit'}}>
                        <div className="card">
                            {carta.imagem_url && (
                                <img 
                                    src={carta.imagem_url} 
                                    alt={carta.nome} 
                                    style={{ maxWidth: '100px', height: 'auto', marginBottom: '10px' }}
                                />
                            )}
                            <h3>{carta.nome}</h3>
                            <p><strong>Tipo:</strong> {carta.tipo || 'N/A'}</p>
                            <p><strong>Ataque/Defesa:</strong> {carta.ataque ?? 'N/A'}/${carta.defesa ?? 'N/A'}</p>
                            <p>{carta.efeito || 'Sem efeito especial.'}</p>
                        <p className="price">
                        R$ {carta.preco} — <span style={{ color: carta.quantidade > 0 ? 'green' : 'red' }}>
                            {carta.quantidade > 0 ? `${carta.quantidade} em estoque` : 'Sem estoque'}
                        </span>
                        </p>
                        {token && (
                            <button className="delete-btn" onClick={() => handleDeleteCard(carta.id, carta.nome)}>Deletar</button>
                        )}
                    </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}