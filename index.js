const express = require('express');
const bodyParser = require('body-parser')
const Sequelize = require('sequelize');
require('dotenv').config();

const port = process.env.BIRDER_PORT;

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
app.use(express.static('public'));

app.get('/', (_, response) => {
    Twit.findAll().then(results => {
        response.render('index', { 'twits': results });
    }).catch(error => {
        console.error(error);
        response.status(500).end();
    });
});

app.post('/', (request, response) => {
    Twit.create({ 'message' : request.body.message }).then(() => {
        response.redirect('/');
    }).catch(error => {
        console.error(error);
        response.status(500).end();
    });
});

sequelize.sync().then(() => {
    User.upsert({
        'login' : process.env.BIRDER_ADMIN_LOGIN,
        'password' : process.env.BIRDER_ADMIN_PASSWORD,
        'admin' : true
    }).then(() => {
        app.listen(port, () => console.log(`Birder is listening on port ${port}.`));
    }); 
});
