const express = require('express');
const router = express.Router();
const db = require('./db');
const axios = require('axios');
const { jwtDecode } = require('jwt-decode');

const validarToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Token de autenticação inválido ou não fornecido.' });
    }
    const token = authHeader.split(' ')[1];

    try {
        await axios.post('http://usuarios_api:3000/api/usuarios/validar-token', { token });
        const decodedToken = jwtDecode(token);
        const usuarioId = decodedToken.id;

        if (!usuarioId) {
            throw new Error('ID do usuário ausente no token.');
        }
        req.usuarioId = usuarioId;
        next();
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error(`[validarToken] Erro na validação/decodificação: ${errorMessage}`);
        return res.status(401).json({ message: 'Acesso não autorizado. Token inválido ou erro interno na validação.' });
    }
};

router.post('/carrinho', validarToken, async (req, res) => {
    const usuarioId = req.usuarioId;
    const { produto_id, quantidade } = req.body;

    if (!usuarioId || !produto_id || quantidade == null) {
        return res.status(400).json({ message: 'Campos obrigatórios: produto_id, quantidade.' });
    }
    if (typeof quantidade !== 'number' || quantidade <= 0) {
        return res.status(400).json({ message: 'Quantidade deve ser um número positivo.' });
    }

    const client = await db.pool.connect();
    console.log(`[POST /carrinho] - UsuarioId: ${usuarioId}, Adicionando produtoId: ${produto_id}, Qtd: ${quantidade}`);

    try {
        await client.query('BEGIN');
        console.log(`[POST /carrinho] - UsuarioId: ${usuarioId}, Transação iniciada para produtoId: ${produto_id}`);

        console.log(`[POST /carrinho] - UsuarioId: ${usuarioId}, Verificando estoque/preço (com lock) para produtoId: ${produto_id}...`);
        const cartaQuery = 'SELECT preco, quantidade FROM cartas WHERE id = $1 FOR UPDATE';
        const cartaResult = await client.query(cartaQuery, [produto_id]);

        if (cartaResult.rows.length === 0 ) {
            await client.query('ROLLBACK');
            return res.status(400).json({message:'Produto não encontrado no catálogo.'})
        }

        const carta = cartaResult.rows[0];
        const estoqueAtual = carta.quantidade;
        const preco_unitario = carta.preco;

        console.log(`[POST /carrinho] - UsuarioId: ${usuarioId}, ProdutoId: ${produto_id}, Estoque: ${estoqueAtual}, Preço: ${preco_unitario}`);

        if (estoqueAtual < quantidade) {
            await client.query('ROLLBACK');
            return res.status(400).json({message: 'Estoque insufienciente para a quantidade solicitada.'})
        }

        const itemExistenteQuery = 'SELECT id, quantidade FROM carrinho_itens WHERE usuario_id = $1 AND produto_id = $2';
        const itemExistente = await client.query(itemExistenteQuery, [usuarioId, produto_id]);

        let resultCarrinho;
        if (itemExistente.rows.length > 0) {
            const existingItem = itemExistente.rows[0];
            const novaQuantidade = existingItem.quantidade + quantidade;
            const updateQuery = 'UPDATE carrinho_itens SET quantidade = $1, preco_unitario = $2 WHERE id = $3 RETURNING *';
            resultCarrinho = await client.query(updateQuery, [novaQuantidade, preco_unitario, existingItem.id]);
        } else { 
            const insertQuery = 'INSERT INTO carrinho_itens (usuario_id, produto_id, quantidade, preco_unitario) VALUES ($1, $2, $3, $4) RETURNING *';
            resultCarrinho = await client.query(insertQuery, [usuarioId, produto_id, quantidade, preco_unitario]);
        }

        const novoEstoque = estoqueAtual - quantidade;
        const updateEstoqueQuery = 'UPDATE cartas SET quantidade = $1 WHERE id = $2';
        await client.query(updateEstoqueQuery, [novoEstoque, produto_id]);

        await client.query('COMMIT');
        console.log(`[POST /carrinho] - UsuarioId: ${usuarioId}, Transação concluída com sucesso para produtoId: ${produto_id}`);

        return res.status(201).json(resultCarrinho.rows[0]);

    } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505' && error.constraint === 'uniq_carrinho_usuario_produto') {
            return res.status(409).json({message: 'Este item já está sendo adicionado ao carrinho. Tente atualizar a quantidade.'});
        }
        return res.status(500).json({message: 'Erro interno do servidor ao processar o carrinho'});
    } finally {
        client.release();
    }
});

router.get('/carrinho/:usuario_id_param', validarToken, async (req, res) => {
    const usuarioId = req.usuarioId;
    const { usuario_id_param } = req.params;

    if (String(usuarioId) !== usuario_id_param) {
         return res.status(403).json({ message: 'Acesso proibido. Você só pode acessar seu próprio carrinho.' });
    }

    try {
        const query = 'SELECT * FROM carrinho_itens WHERE usuario_id = $1 ORDER BY adicionado_em DESC';
        const result = await db.query(query, [usuarioId]);
        return res.status(200).json(result.rows);
    } catch (error) {
        console.error(`[GET /carrinho/:id] Erro: ${error.message}`);
        return res.status(500).json({ message: 'Erro interno do servidor ao buscar itens do carrinho.' });
    }
});

router.put('/carrinho/:item_id', validarToken, async (req, res) => {
    const usuarioId = req.usuarioId;
    const { item_id } = req.params;
    const { quantidade: novaQuantidade } = req.body;

    console.log(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, Tentando atualizar itemId: ${item_id} -> novaQtd: ${novaQuantidade}`);

    if (novaQuantidade == null || typeof novaQuantidade !== 'number' || novaQuantidade <= 0) {
        console.warn(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, itemId: ${item_id} - Bad Request: Quantidade inválida (${novaQuantidade}).`);
        return res.status(400).json({ message: 'A quantidade deve ser um número positivo.' });
    }

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const itemQuery = 'SELECT produto_id, quantidade FROM carrinho_itens WHERE id = $1 AND usuario_id = $2 FOR UPDATE';
        const itemResult = await client.query(itemQuery, [item_id, usuarioId]);

        if (itemResult.rows.length === 0) {
            console.warn(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, itemId: ${item_id} não encontrado ou não pertence ao usuário (404).`);
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Item do carrinho não encontrado ou não pertence a este usuário.' });
        }

        const itemAntigo = itemResult.rows[0];
        const produtoId = itemAntigo.produto_id;
        const quantidadeAntiga = itemAntigo.quantidade;
        const diferencaQuantidade = novaQuantidade - quantidadeAntiga;

        let estoqueAtual;
        if (diferencaQuantidade !== 0) {
            const cartaQuery = 'SELECT quantidade FROM cartas WHERE id = $1 FOR UPDATE';
            const cartaResult = await client.query(cartaQuery, [produtoId]);

            if (cartaResult.rows.length === 0) {
                console.error(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, itemId: ${item_id} - ERRO CRÍTICO: ProdutoId ${produtoId} não encontrado durante verificação de estoque.`);
                await client.query('ROLLBACK');
                return res.status(500).json({ message: 'Erro: Produto associado ao carrinho não encontrado no catálogo.' });
            }
            estoqueAtual = cartaResult.rows[0].quantidade;

            if (diferencaQuantidade > 0 && estoqueAtual < diferencaQuantidade) {
                console.warn(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, Estoque insuficiente para produtoId: ${produtoId}. Necessário: ${diferencaQuantidade}, Disponível: ${estoqueAtual}`);
                await client.query('ROLLBACK');
                return res.status(400).json({ message: `Estoque insuficiente. Apenas ${estoqueAtual} unidades adicionais disponíveis.` });
            }
        }

        const updateCarrinhoQuery = 'UPDATE carrinho_itens SET quantidade = $1 WHERE id = $2 AND usuario_id = $3 RETURNING *';
        const resultCarrinho = await client.query(updateCarrinhoQuery, [novaQuantidade, item_id, usuarioId]);

        if (resultCarrinho.rows.length === 0) {
            console.error(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, Falha ao atualizar itemId: ${item_id} após lock (inesperado).`);
            await client.query('ROLLBACK');
            return res.status(500).json({ message: 'Erro inesperado ao atualizar item do carrinho.' });
        }

        if (diferencaQuantidade !== 0) {
            let estoqueAntesDoAjuste = estoqueAtual;
            if (estoqueAntesDoAjuste === undefined) {
                 const estoqueAtualResult = await client.query('SELECT quantidade FROM cartas WHERE id = $1', [produtoId]);
                 if (estoqueAtualResult.rows.length === 0) {
                      console.error(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, itemId: ${item_id} - ERRO CRÍTICO: ProdutoId ${produtoId} não encontrado durante ajuste de estoque para decremento.`);
                      await client.query('ROLLBACK');
                      return res.status(500).json({ message: 'Erro: Produto associado ao carrinho não encontrado no catálogo para ajustar estoque.' });
                 }
                 estoqueAntesDoAjuste = estoqueAtualResult.rows[0].quantidade;
            }

            const novoEstoqueCalculado = estoqueAntesDoAjuste - diferencaQuantidade;

            if (novoEstoqueCalculado < 0) {
                 console.error(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, itemId: ${item_id} - ERRO LÓGICO: Tentativa de deixar estoque negativo (${novoEstoqueCalculado}) para produtoId: ${produtoId}.`);
                 await client.query('ROLLBACK');
                 return res.status(500).json({ message: 'Erro interno: Cálculo resultou em estoque negativo.' });
            }

            const updateEstoqueQuery = 'UPDATE cartas SET quantidade = $1 WHERE id = $2';
            await client.query(updateEstoqueQuery, [novoEstoqueCalculado, produtoId]);
        }

        await client.query('COMMIT');
        console.log(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, itemId: ${item_id} atualizado para qtd ${novaQuantidade}. Estoque ajustado.`);

        return res.status(200).json(resultCarrinho.rows[0]);

    } catch (error) {
        console.error(`[PUT /carrinho/:item_id] - UsuarioId: ${usuarioId}, ERRO na transação para itemId: ${item_id}: ${error.message}`, error.stack);
        await client.query('ROLLBACK');
        return res.status(500).json({ message: 'Erro interno do servidor ao processar atualização do carrinho.' });
    } finally {
        client.release();
    }
});

router.delete('/carrinho/:item_id', validarToken, async (req, res) => {
    const usuarioId = req.usuarioId;
    const { item_id } = req.params;

    console.log(`[DELETE /carrinho/:item_id] - UsuarioId: ${usuarioId}, Iniciando remoção do itemId: ${item_id}`);

    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        const itemQuery = 'SELECT produto_id, quantidade FROM carrinho_itens WHERE id = $1 AND usuario_id = $2 FOR UPDATE';
        const itemResult = await client.query(itemQuery, [item_id, usuarioId]);

        if (itemResult.rows.length === 0) {
            console.warn(`[DELETE /carrinho/:item_id] - UsuarioId: ${usuarioId}, ItemId: ${item_id} não encontrado ou não pertence ao usuário (404).`);
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Item do carrinho não encontrado ou não pertence a este usuário.' });
        }

        const itemParaRemover = itemResult.rows[0];
        const produtoId = itemParaRemover.produto_id;
        const quantidadeParaDevolver = itemParaRemover.quantidade;

        const deleteQuery = 'DELETE FROM carrinho_itens WHERE id = $1 AND usuario_id = $2';
        await client.query(deleteQuery, [item_id, usuarioId]);

        const updateEstoqueQuery = 'UPDATE cartas SET quantidade = quantidade + $1 WHERE id = $2';
        await client.query(updateEstoqueQuery, [quantidadeParaDevolver, produtoId]);

        await client.query('COMMIT');

        console.log(`[DELETE /carrinho/:item_id] - UsuarioId: ${usuarioId}, ItemId: ${item_id} removido e ${quantidadeParaDevolver} unidade(s) do ProdutoId: ${produtoId} devolvidas ao estoque com sucesso.`);
        return res.status(204).send();

    } catch (error) {
        console.error(`[DELETE /carrinho/:item_id] - UsuarioId: ${usuarioId}, ERRO na transação para itemId: ${item_id}: ${error.message}`, error.stack);
        await client.query('ROLLBACK');
        return res.status(500).json({ message: 'Erro interno do servidor ao processar remoção do carrinho.' });
    } finally {
        client.release();
    }
});

module.exports = router;