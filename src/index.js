const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const cmsp = require('./utils/cmsp');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors());
app.use(express.static(path.join(__dirname, 'pages')));

app.post('/api/login', async (req, res) => {
    const { ra, pwd } = req.body;

    if (!ra || typeof ra !== 'string') return res.json({error: 'invalid ra'});
    if (!pwd || typeof pwd !== 'string') return res.json({error: 'invalid pwd'});

    const login = await cmsp.login(ra, pwd);
    if (!login) return res.json({error: 'invalid credentials'});

    const client = cmsp.client(login.auth_token);
    const roomsObj = await client.getRooms();

    const rooms = [];
    for (const r of roomsObj) {
        const roomObj = {
            id: r.name,
            school: r.meta.nome_escola,
            name: r.topic
        }

        rooms.push(roomObj);
    }
    
    res.json({
        name: login.name,
        rooms
    });
});

app.get('/api/student', async (req, res) => {
    const { ra, pwd } = req.query;

    if (!ra || typeof ra !== 'string') return res.json({error: 'invalid ra'});
    if (!pwd || typeof pwd !== 'string') return res.json({error: 'invalid pwd'});

    const login = await cmsp.login(ra, pwd);
    if (!login) return res.json({error: 'invalid credentials'});

    const client = cmsp.client(login.auth_token, login.nick, login.external_id, {ra, pwd});
    const statistics = await client.getStatistics();
    if (!statistics) return res.status(500).json({error: 'invalid statistics'});

    res.json(statistics);
});

app.listen(3000, () => {
    console.log('[INFO] RepresentaBOT is online!');
});
