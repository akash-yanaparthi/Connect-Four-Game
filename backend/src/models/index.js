// backend/src/models/index.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: false,
    define: {
      underscored: true,
      timestamps: false
    }
  }
);

const db = { sequelize, Sequelize };

// load models
db.Player = require('./player')(sequelize);
db.Game = require('./game')(sequelize);

// Associations
// Player as player1 and player2 in games
db.Player.hasMany(db.Game, { foreignKey: 'player1_id', as: 'gamesAsPlayer1' });
db.Player.hasMany(db.Game, { foreignKey: 'player2_id', as: 'gamesAsPlayer2' });

// IMPORTANT: avoid alias 'wins' because it collides with attribute `wins` on Player
// Use 'gamesWon' instead
db.Player.hasMany(db.Game, { foreignKey: 'winner_id', as: 'gamesWon' });

// also set the reverse belongsTo associations on Game for convenience
db.Game.belongsTo(db.Player, { foreignKey: 'player1_id', as: 'player1' });
db.Game.belongsTo(db.Player, { foreignKey: 'player2_id', as: 'player2' });
db.Game.belongsTo(db.Player, { foreignKey: 'winner_id', as: 'winner' });

module.exports = db;
