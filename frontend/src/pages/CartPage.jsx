import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function CartPage() {
    const [cartItems, setCartItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [removingItemId, setRemovingItemId] = useState(null);
    const navigate = useNavigate();
    const cartApiUrl = '/api/carrinho_proxy';
    const catalogApiUrl = '/api/catalogo_proxy';
    
    const fetchCart = useCallback(async () => {
     const token = localStorage.getItem('authToken');

        if (!token) {
            navigate('/');
            return;
        }

        let userId;
        try {
            userId = JSON.parse(atob(token.split('.')[1])).id;
        } catch (e) {
            console.error("Erro ao decodificar token:", e);
            localStorage.removeItem('authToken');
            navigate('/');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const cartResponse = await fetch(`${cartApiUrl}/carrinho/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!cartResponse.ok) {
                let errorMsg = 'Falha ao buscar itens do carrinho.';
                try {
                    const errData = await cartResponse.json();
                    errorMsg = errData.message || `Status: ${cartResponse.status}`;
                } catch (jsonError) {
                    errorMsg = `Status: ${cartResponse.status} - ${cartResponse.statusText}`;
                }
                throw new Error(errorMsg);
            }
            const cartData = await cartResponse.json();

            const results = await Promise.allSettled(
                cartData.map(async (cartItem) => {
                    const productResponse = await fetch(`${catalogApiUrl}/cartas/${cartItem.produto_id}`);
                    if (!productResponse.ok) {
                        throw new Error(`Produto ID ${cartItem.produto_id} não encontrado no catálogo`);
                    }
                    const productData = await productResponse.json();

                    return {
                        cartItemId: cartItem.id,
                        produto_id: cartItem.produto_id,
                        quantidade: cartItem.quantidade,
                        preco_unitario: cartItem.preco_unitario,
                        adicionado_em: cartItem.adicionado_em,
                        nome: productData.nome,
                        tipo: productData.tipo,
                        ataque: productData.ataque,
                        defesa: productData.defesa,
                        efeito: productData.efeito,
                        estoque_disponivel: productData.quantidade ?? 0,
                        imagem_url: productData.imagem_url || null,
                    };
                })
            );

            const enrichedItems = results
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);

            results.filter(result => result.status === 'rejected').forEach(result => {
                console.warn("Item órfão no carrinho ignorado:", result.reason?.message || result.reason);
            });

            setCartItems(enrichedItems);
        } catch (err) {
            setError(err.message);
            setCartItems([]);
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => {
        fetchCart();
    }, [fetchCart]);

    const handleUpdateQuantity = async (itemId, newQuantity) => {
        const token = localStorage.getItem('authToken');

        if (!newQuantity || newQuantity <= 0) {
            handleRemoveItem(itemId);
            return;
        }

        try {
            const response = await fetch(`${cartApiUrl}/carrinho/${itemId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ quantidade: newQuantity })
            });

            if (!response.ok) {
                let errorMsg = 'Erro desconhecido da API ao atualizar quantidade.';
                try {
                    const errData = await response.json();
                    errorMsg = errData.message || `Status: ${response.status}`;
                } catch (jsonError) {
                    errorMsg = `Status: ${response.status} - ${response.statusText}`;
                }
                throw new Error(errorMsg);
            }

            fetchCart();
        } catch (err) {
            alert(`Erro ao atualizar a quantidade: ${err.message}`);
        }
    };

    const handleRemoveItem = async (itemId) => {
        const token = localStorage.getItem('authToken');
        if (!confirm('Tem certeza que deseja remover este item?')) return;

        const originalCartItems = [...cartItems];

        setCartItems(prevItems => prevItems.filter(item => item.cartItemId !== itemId));
        setRemovingItemId(itemId);

        try {
            const response = await fetch(`${cartApiUrl}/carrinho/${itemId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok && response.status !== 204) {
                let errorMsg = 'Erro desconhecido da API ao remover item.';
                try {
                    const errData = await response.json();
                    errorMsg = errData.message || `Status: ${response.status}`;
                } catch (jsonError) {
                    errorMsg = `Status: ${response.status} - ${response.statusText}`;
                }
                throw new Error(errorMsg);
            }

        } catch (err) {
            alert(`Erro ao remover o item: ${err.message}`);
            setCartItems(originalCartItems);
        } finally {
            setRemovingItemId(null);
        }
    };

    const totalPrice = cartItems.reduce((total, item) => total + (item.quantidade * item.preco_unitario), 0);

    if (loading) return <p>Carregando carrinho...</p>;
    if (error) return <p className="error">{error}</p>;

    return (
        <div className="catalog-page">
            <div className="catalog-header">
                <h1>Meu Carrinho</h1>
                <Link to="/catalog" className="nav-link">Continuar Comprando</Link>
            </div>
            {cartItems.length === 0 ? (
                <p>Seu carrinho está vazio.</p>
            ) : (
                <div>
                    {cartItems.map(item => (
                        <div 
                            key={item.cartItemId} 
                            className="card" 
                            style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                marginBottom: '1rem', 
                                padding: '1rem', 
                                gap: '1rem' 
                            }}
                            >
                            {item.imagem_url && (
                                <img
                                    src={item.imagem_url}
                                    alt={item.nome}
                                    style={{ width: '80px', height: 'auto', borderRadius: '8px' }}
                                />
                            )}
                            <div style={{ flexGrow: 1 }}>
                                <h3>{item.nome || `Produto ID: ${item.produto_id}`}</h3>
                                <p><strong>Preço Unitário:</strong> R$ {Number(item.preco_unitario).toFixed(2)}</p>
                                <p><strong>Subtotal:</strong> R$ {(item.quantidade * item.preco_unitario).toFixed(2)}</p>
                                <p>
                                    <strong>Estoque disponível:</strong>{' '}
                                    <span style={{ color: item.estoque_disponivel > 0 ? 'green' : 'red' }}>
                                    {item.estoque_disponivel > 0
                                        ? `${item.estoque_disponivel} unidade${item.estoque_disponivel > 1 ? 's' : ''}`
                                        : 'Sem estoque'}
                                    </span>
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <label htmlFor={`qtd-${item.cartItemId}`}>Qtd:</label>
                                <input
                                    id={`qtd-${item.cartItemId}`}
                                    type="number"
                                    value={item.quantidade}
                                    onChange={(e) => {
                                        const novaQtd = parseInt(e.target.value) || 0;
                                        const maxPermitido = item.quantidade + (item.estoque_disponivel ?? 0); 
                                        const qtdAjustada = Math.max(0, Math.min(novaQtd, maxPermitido));

                                        if (novaQtd > maxPermitido) {
                                            alert(`Quantidade máxima em estoque: ${item.estoque_disponivel}. Você já tem ${item.quantidade}.`);
                                            handleUpdateQuantity(item.cartItemId, maxPermitido);
                                        } else {
                                            handleUpdateQuantity(item.cartItemId, qtdAjustada);
                                        }
                                    }}
                                    min="0"
                                    style={{ width: '60px', textAlign: 'center' }}
                                />
                                <button
                                    className="delete-btn"
                                    onClick={() => handleRemoveItem(item.cartItemId)}
                                    disabled={removingItemId === item.cartItemId}
                                >
                                    {removingItemId === item.cartItemId ? 'Removendo...' : 'Remover'}
                                </button>
                            </div>
                        </div>
                    ))}
                    <div style={{ textAlign: 'right', marginTop: '2rem', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        Total: R$ {totalPrice.toFixed(2)}
                    </div>
                </div>
            )}
        </div>
    );
}