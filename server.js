// Importa os pacotes necessários
const express = require('express');
const axios = require('axios'); // Para fazer requisições HTTP
const JSZip = require('jszip'); // Para criar ficheiros .zip
const cors = require('cors'); // Para permitir requisições do frontend
const cheerio = require('cheerio'); // Para "ler" o HTML, como o jQuery
const url = require('url');

// Inicializa a aplicação Express
const app = express();
const PORT = process.env.PORT || 3001; // O Render definirá a porta automaticamente

// Middlewares
app.use(cors()); // Habilita o CORS para que o seu frontend possa chamar este backend
app.use(express.json());

// Rota principal para verificar se o servidor está no ar
app.get('/', (req, res) => {
    res.send('Servidor do Website Downloader está no ar! Use a rota /download?url=https://...');
});

// A rota principal da nossa aplicação
app.get('/download', async (req, res) => {
    const targetUrl = req.query.url;

    // Validação simples da URL
    if (!targetUrl) {
        return res.status(400).send({ error: 'URL é obrigatória.' });
    }

    try {
        console.log(`Iniciando download de: ${targetUrl}`);
        const zip = new JSZip();

        // 1. Baixar o HTML principal
        const { data: htmlContent } = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });
        zip.file('index.html', htmlContent);
        console.log('HTML baixado e adicionado ao zip.');

        // 2. Carregar o HTML com Cheerio para encontrar os ficheiros CSS e JS
        const $ = cheerio.load(htmlContent);
        const assetPromises = []; // Array para guardar todas as promessas de download

        // Função para baixar um único ficheiro
        const downloadAsset = async (assetUrl, folder) => {
            try {
                // Constrói a URL absoluta do ficheiro
                const absoluteUrl = new url.URL(assetUrl, targetUrl).href;
                const fileName = absoluteUrl.substring(absoluteUrl.lastIndexOf('/') + 1).split('?')[0] || 'unknown';
                
                console.log(`Baixando ${folder}/${fileName} de ${absoluteUrl}`);
                const response = await axios.get(absoluteUrl, { responseType: 'arraybuffer' });
                
                // Adiciona o ficheiro ao zip dentro da pasta correta
                zip.folder(folder).file(fileName, response.data);
                console.log(`Sucesso ao baixar e adicionar ${folder}/${fileName}`);
            } catch (error) {
                console.error(`Falha ao baixar ${assetUrl}: ${error.message}`);
                // Não para o processo se um único ficheiro falhar
            }
        };

        // 3. Encontrar e baixar todos os ficheiros CSS
        $('link[rel="stylesheet"]').each((i, element) => {
            const cssUrl = $(element).attr('href');
            if (cssUrl) {
                assetPromises.push(downloadAsset(cssUrl, 'css'));
            }
        });

        // 4. Encontrar e baixar todos os ficheiros JS
        $('script[src]').each((i, element) => {
            const jsUrl = $(element).attr('src');
            if (jsUrl) {
                assetPromises.push(downloadAsset(jsUrl, 'js'));
            }
        });

        // 5. Esperar que todos os downloads terminem
        await Promise.all(assetPromises);
        console.log('Todos os downloads de ficheiros foram concluídos.');

        // 6. Gerar o ficheiro .zip
        const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
        
        // Extrai o nome do domínio para o nome do ficheiro
        const domain = new url.URL(targetUrl).hostname;
        const zipFileName = `${domain}-assets.zip`;

        // 7. Enviar o .zip como resposta
        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${zipFileName}"`,
        });
        res.send(zipContent);
        console.log(`Ficheiro ${zipFileName} enviado com sucesso.`);

    } catch (error) {
        console.error(`Erro no processo: ${error.message}`);
        res.status(500).send({ error: 'Falha ao processar a URL.', details: error.message });
    }
});

// Inicia o servidor
app.listen(PORT, () => {
    console.log(`Servidor a rodar na porta ${PORT}`);
});

