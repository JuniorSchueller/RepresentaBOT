let gotInstance = null;
const getGot = async () => {
    if (!gotInstance) {
        const { gotScraping } = await import('got-scraping');
        gotInstance = gotScraping;
    }
    return gotInstance;
};

const BASE_HEADERS = {
    'origin': 'https://cmsp.ip.tv',
    'referer': 'https://cmsp.ip.tv/',
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'x-api-platform': 'webclient',
    'x-api-realm': 'edusp'
};

const ocpApimSubscriptionKey = 'd701a2043aa24d7ebb37e9adf60d043b';

async function login(id, password, realm = 'edusp', platform = 'webclient') {
    try {
        const got = await getGot();
        const response = await got.post('https://edusp-api.ip.tv/registration/edusp', {
            json: { id, password, realm, platform },
            headers: BASE_HEADERS,
            responseType: 'json'
        });

        return response.body || null;
    } catch (error) {
        console.error('[CMSP] Authentication failed:', error.message);
        return null;
    }
}

function client(token, nick = '', externalId = '', credentials = {}) {
    const apiCall = async (url, options = {}) => {
        try {
            const got = await getGot();
            return await got(url, {
                ...options,
                headers: {
                    ...BASE_HEADERS,
                    'x-api-key': token,
                    ...options.headers,
                },
                responseType: 'json'
            });
        } catch (error) {
            console.error('[CMSP] API Call failed:', error.message);
            return null;
        }
    };

    const methods = {
        token,
        nick,
        externalId,

        isTokenValid: async () => {
            try {
                const res = await apiCall('https://edusp-api.ip.tv/room/user');
                return res?.statusCode === 200;
            } catch {
                return false;
            }
        },

        getRooms: async () => {
            try {
                const res = await apiCall('https://edusp-api.ip.tv/room/user?list_all=true&with_cards=true');
                return res?.body?.rooms || [];
            } catch (error) {
                console.error('[CMSP] Rooms fetch failed:', error.message);
                return [];
            }
        },

        getStatistics: async () => {
            try {
                const got = await getGot();
                const sdfLogin = await got.post('https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/credenciais/api/LoginCompletoToken', {
                    json: { user: credentials.ra, senha: credentials.pwd },
                    headers: {
                        'ocp-apim-subscription-key': ocpApimSubscriptionKey
                    },
                    responseType: 'json'
                });

                const sdfToken = sdfLogin.body.token;

                const rooms = await methods.getRooms();
                if (!rooms.length) return null;

                const targets = new Set();
                for (const r of rooms) {
                    if (r.name) {
                        targets.add(encodeURIComponent(r.name));
                        if (methods.nick) targets.add(encodeURIComponent(`${r.name}:${methods.nick}`));
                    }
                    for (const c of r.group_categories) { targets.add(c.id) };
                }

                const pTarget = 'publication_target=' + Array.from(targets).join('&publication_target=');

                const urlPending = `https://edusp-api.ip.tv/survey/todo/count?${pTarget}&filter_expired=true&with_answer=true&answer_statuses=draft`;
                const urlExpired = `https://edusp-api.ip.tv/survey/todo/count?${pTarget}&filter_expired=false&with_answer=true&answer_statuses=draft`;
                const urlFrequency = `https://sedintegracoes.educacao.sp.gov.br/saladofuturobffapi/apiboletim/api/Frequencia/GetFaltasBimestreAtual?codigoAluno=${externalId.slice(0, externalId.length - 1)}`;

                const [pendingRes, expiredRes, frequencyRes] = await Promise.all([
                    apiCall(urlPending),
                    apiCall(urlExpired),
                    got.get(urlFrequency, {
                        headers: {
                            'ocp-apim-subscription-key': ocpApimSubscriptionKey,
                            'authorization': `Bearer ${sdfToken}`
                        },
                        responseType: 'json'
                    })
                ]);

                const userObj = {
                    name: sdfLogin?.body?.DadosUsuario?.NAME
                }

                const pendingCount = pendingRes?.body?.count || 0;
                const expiredCount = expiredRes?.body?.count - pendingCount || 0;
                const totalCount = expiredRes?.body?.count;
                const frequencyData = frequencyRes?.body?.data[0];

                const frequencyObj = {
                    missingPercentage: frequencyData.porcentagemFaltas || 0,
                    frequencyPercentage: frequencyData.porcentagemFrequencia || 0,
                    realizedClasses: frequencyData.totalAulasRealizadas || 0,
                    totalMissedClasses: frequencyData.totalFaltasBimestre || 0
                }

                const statistics = {
                    user: userObj,
                    tasks: {
                        pendingCount,
                        expiredCount,
                        totalCount
                    },
                    frequency: frequencyObj
                }

                return statistics;
            } catch (error) {
                console.error('[CMSP] Statistics fetch failed:', error.message);
                return null;
            }
        }
    };

    return methods;
}

module.exports = { login, client };