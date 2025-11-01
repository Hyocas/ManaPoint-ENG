import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

export default function CardDetailPage() {
    const [carta, setCarta] = useState(null);
    const [loading, setLoading] = useState(true);
    const { id } = useParams();
    const cartApiUrl = '/api/carrinho_proxy';

    useEffect(() => {
        const fetchCard = async () => {
            try {
                const response = await fetch(`/api/catalogo_proxy/cartas/${id}`);
                if (!response.ok) throw new Error('Carta não encontrada.');
                const data = await response.json();
                setCarta(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchCard();
    }, [id]);

        const handleUpdateQuantity = async (itemId, newQuantity) => {
        const token = localStorage.getItem('authToken');
        if (newQuantity <= 0) {
            handleRemoveItem(itemId);
            return;
        }
        try {
            await fetch(`${cartApiUrl}/carrinho/${itemId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ quantidade: newQuantity })
            });
            fetchCart();
        } catch (err) {
            alert('Erro ao atualizar a quantidade.');
        }
    };

    const handleRemoveItem = async (itemId) => {
        const token = localStorage.getItem('authToken');
        if (!confirm('Tem certeza que deseja remover este item?')) return;
        try {
            await fetch(`${cartApiUrl}/carrinho/${itemId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchCart();
        } catch (err) {
            alert('Erro ao remover o item.');
        }
    };

    const handleAddToCart = async () => {
        console.log('--- Iniciando handleAddToCart ---'); 

        const token = localStorage.getItem('authToken');
        if (!token) {
            console.error('ERRO: Token não encontrado. O usuário não está logado.');
            alert('Você precisa estar logado para adicionar itens ao carrinho.');
            return;
        }
        console.log('Token encontrado:', token);

        try {
            const userId = JSON.parse(atob(token.split('.')[1])).id;
            console.log(`Dados para a API: userId=${userId}, produtoId=${carta.id}, quantidade=1`);

            const response = await fetch(`${cartApiUrl}/carrinho`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    usuario_id: userId,
                    produto_id: carta.id,
                    quantidade: 1
                })
            });
            
            console.log('Resposta da API recebida:', response);

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || 'Erro desconhecido da API.');
            }

            console.log('Sucesso! Carta adicionada:', data);
            alert(`'${carta.nome}' adicionado ao carrinho!`);

        } catch (error) {
            console.error('--- ERRO CAPTURADO NO CATCH ---', error);
            alert(`Falha ao adicionar ao carrinho: ${error.message}`);
        }
    };
    
    if (loading) return <p>Carregando carta...</p>;
    if (!carta) return <p>Carta não encontrada. <Link to="/catalog">Voltar ao Catálogo</Link></p>;

    return (
        <div className="container">
            <div className="card" style={{margin: 'auto'}}>
                {carta.imagem_url && (
                    <img 
                        src={carta.imagem_url} 
                        alt={carta.nome} 
                        style={{ maxWidth: '200px', height: 'auto', display: 'block', margin: '0 auto 15px auto' }} // Estilo básico
                    />
                )}
                <h3>{carta.nome}</h3>
                <p><strong>Tipo:</strong> {carta.tipo || 'N/A'}</p>
                <p><strong>Ataque/Defesa:</strong> {carta.ataque ?? 'N/A'}/${carta.defesa ?? 'N/A'}</p>
                <p>{carta.efeito || 'Sem efeito especial.'}</p>
                <p className="price">R$ {carta.preco}</p>
                <button onClick={handleAddToCart} style={{marginTop: '1rem'}}>Adicionar ao Carrinho</button>
                <br/>
                <Link to="/catalog">Voltar ao Catálogo</Link>
            </div>
        </div>
    );
}