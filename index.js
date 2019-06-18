const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const Sequelize = require('sequelize');
const bcrypt = require('bcrypt');
const fs = require('fs');
const https = require('https');
const http = require('http');
require('dotenv').config();

const httpPort = process.env.BIRDER_HTTP_PORT;
const httpsPort = process.env.BIRDER_HTTPS_PORT;

const privateKey = fs.readFileSync(process.env.BIRDER_HTTPS_PRIVKEY, 'utf8');
const certificate = fs.readFileSync(process.env.BIRDER_HTTPS_CERT, 'utf8');
const ca = fs.readFileSync(process.env.BIRDER_HTTPS_CHAIN, 'utf8');
const credentials = {
	key: privateKey,
	cert: certificate,
	ca: ca
};

const sequelize = new Sequelize({
    host: process.env.BIRDER_DB_HOST,
    port: process.env.BIRDER_DB_PORT,
    username: process.env.BIRDER_DB_USER,
    password: process.env.BIRDER_DB_PASSWORD,
    database: process.env.BIRDER_DB_NAME,
    dialect: process.env.BIRDER_DB_DIALECT
});

const User = sequelize.define('user', {
    'login' : {
        'type' : Sequelize.STRING,
        'allowNull' : false,
        'unique' : true
    },
    'password' : {
        'type' : Sequelize.STRING,
        'allowNull' : false
    },
    'admin' : {
        'type' : Sequelize.BOOLEAN,
        'allowNull' : false,
        'defaultValue': false
    }
});

const Twit = sequelize.define('twit', {
    'message' : {
        'type' : Sequelize.STRING,
        'allowNull' : false
    }
});

User.hasMany(Twit);
Twit.belongsTo(User);

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(session({
    secret: process.env.BIRDER_SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));
app.use(express.static('public'));

app.get('/', (request, response) => {
    Twit.findAll().then(results => {
        response.render('index', { 'twits': results, 'session' : request.session });
    }).catch(error => {
        console.error(error);
        response.status(500).end();
    });
});

app.post('/', (request, response) => {
    if (!request.session.authorized) {
        console.error('An unauthorized attempt to create a twit.');
        response.status(401).end();

        return;
    }

    Twit.create({
        'message' : request.body.message,
        'userId' : request.session.userId
    }).then(() => {
        response.redirect('/');
    }).catch(error => {
        console.error(error);
        response.status(500).end();
    });
});

app.get('/register', (request, response) => {
    response.render('register', { 'session' : request.session });
});

app.post('/register', (request, response) => {
    const login = request.body.login;
    const password = request.body.password;
    const passwordRepeat = request.body['password-repeat'];

    // TODO: login sanity checks
    // TODO: password sanity checks

    if (password !== passwordRepeat) {
        request.session.error = 'Passwords are not the same.'
        response.redirect('/register');

        return;
    }

    User.create({
        'login' : login,
        'password' : bcrypt.hashSync(password, parseInt(process.env.BIRDER_PASSWORD_SALT_ROUNDS))
    }).then(user => {
        request.session.authorized = true;
        request.session.login = login;
        request.session.userId = user.id;
        response.redirect('/');
    }).catch(error => {
        //if (error instanceof Sequelize.SequelizeUniqueConstraintError) {
        //    request.session.error = 'A user with such name exists.'
        //    response.redirect('/register');
        //} else {
            console.error(error);
            response.status(500).end(); // TODO: Analyze
        //}
    });
});

app.get('/login', (request, response) => {
    response.render('login', { 'session' : request.session });
});

app.post('/login', (request, response) => {
    const login = request.body.login;
    const password = request.body.password;

    User.findOne({
        'where' : { 'login' : login }
    }).then(user => {
        if (!user || !bcrypt.compareSync(password, user.password)) {
            request.session.error = 'Failed to login. Invalid login data.'
            response.redirect('/login');

            return;
        }

        request.session.authorized = true;
        request.session.login = user.login;
        request.session.userId = user.id;
        response.redirect('/');
    }).catch(error => {
        console.error(error);
        response.status(500).end();
    });
});

app.get('/logout', (request, response) => {
    request.session.regenerate(() => {
        response.redirect('/');
    });
})

/*
app.post('/twit/:twitID/delete', (request, response) => {
    const twitID = request.params['twitID'];
    console.log(twitID);
    Twit.destroy({
        where: {
          id: twitID
        }
    }).then(() => {
        response.redirect('/');
    });
});
*/

sequelize.sync().then(() => {
    User.upsert({
        'login' : process.env.BIRDER_ADMIN_LOGIN,
        'password' : bcrypt.hashSync(process.env.BIRDER_ADMIN_PASSWORD, parseInt(process.env.BIRDER_PASSWORD_SALT_ROUNDS)),
        'admin' : true
    }).then(() => {
        http.createServer((req, res) => {
            res.writeHead(301, { 'Location': `https://${req.headers['host']}${req.url}` });
            res.end();
        }).listen(httpPort);

        const httpsServer = https.createServer(credentials, app);
        httpsServer.listen(httpsPort, () => console.log(`Birder is listening on port ${httpsPort}.`));
    });
});