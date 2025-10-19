# Connect Four Game

A modern, real-time multiplayer Connect Four game implementation with a beautiful user interface and seamless multiplayer experience.

## Features

- 🎮 Real-time multiplayer gameplay
- 🎨 Modern and responsive user interface
- 🔒 Secure authentication system
- 📱 Cross-platform compatibility
- ⚡ Real-time game state updates
- 🏆 Player statistics and leaderboards

## Tech Stack

- Frontend: React.js
- Backend: Node.js with Express
- Real-time Communication: Socket.IO
- Database: MySQL

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- npm 

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/akash-yanaparthi/Connect-Four-Game.git
   cd connect-four-realtime
   ```

2. Install dependencies:
   ```bash
   # Install backend dependencies
   cd backend
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

3. Set up environment variables:
   Create `.env` files in both server and client directories with the required configurations.

## Running the Application

### Development Mode

1. Start the backend server:
   ```bash
   cd backend
   npm run dev
   ```

2. Start the frontend development server:
   ```bash
   cd frontend
   npm run dev
   ```



## Game Rules

1. Players take turns dropping colored discs into a seven-column, six-row grid
2. The pieces fall straight down, occupying the lowest available space within the column
3. The first player to form a horizontal, vertical, or diagonal line of four of their own discs wins
4. If no player achieves four in a row and all spaces are filled, the game is a draw



## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request



## Acknowledgments

- Socket.IO team for the excellent real-time engine
- React.js community for the amazing frontend framework


## Contact

Y L N J Rao Akash 
vram5265@gmail.com
