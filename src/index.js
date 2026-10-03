const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Forside
app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="da">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ShardNote Dashboard</title>

    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: Arial, sans-serif;
            background: #0b0b0f;
            color: white;
            min-height: 100vh;
        }

        .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            width: 240px;
            height: 100vh;
            background: #111116;
            border-right: 1px solid #292932;
            padding: 25px 15px;
        }

        .logo {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 35px;
            padding-left: 10px;
        }

        .logo span {
            color: #5865f2;
        }

        .menu button {
            width: 100%;
            padding: 13px;
            margin-bottom: 8px;
            background: transparent;
            border: none;
            color: #aaa;
            text-align: left;
            border-radius: 8px;
            cursor: pointer;
            font-size: 15px;
        }

        .menu button:hover,
        .menu button.active {
            background: #5865f2;
            color: white;
        }

        .main {
            margin-left: 240px;
            padding: 35px;
        }

        .header {
            margin-bottom: 30px;
        }

        .header h1 {
            font-size: 32px;
            margin-bottom: 8px;
        }

        .header p {
            color: #888;
        }

        .cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .card {
            background: #15151c;
            border: 1px solid #292932;
            border-radius: 12px;
            padding: 22px;
        }

        .card h3 {
            color: #999;
            font-size: 14px;
            margin-bottom: 12px;
        }

        .card .value {
            font-size: 25px;
            font-weight: bold;
        }

        .online {
            color: #43d17a;
        }

        .content {
            background: #15151c;
            border: 1px solid #292932;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 20px;
        }

        .content h2 {
            margin-bottom: 20px;
        }

        .command-box {
            display: flex;
            gap: 10px;
        }

        input {
            flex: 1;
            background: #0d0d12;
            border: 1px solid #30303a;
            border-radius: 8px;
            color: white;
            padding: 13px;
            outline: none;
        }

        input:focus {
            border-color: #5865f2;
        }

        .send-button {
            background: #5865f2;
            border: none;
            color: white;
            padding: 13px 22px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: bold;
        }

        .send-button:hover {
            background: #4752c4;
        }

        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 15px;
        }

        .feature {
            background: #101016;
            border: 1px solid #292932;
            border-radius: 10px;
            padding: 20px;
        }

        .feature h3 {
            margin-bottom: 8px;
        }

        .feature p {
            color: #888;
            font-size: 14px;
        }

        #result {
            margin-top: 15px;
            color: #43d17a;
        }

        @media (max-width: 700px) {
            .sidebar {
                width: 190px;
            }

            .main {
                margin-left: 190px;
                padding: 20px;
            }

            .command-box {
                flex-direction: column;
            }
        }
    </style>
</head>

<body>

    <aside class="sidebar">
        <div class="logo">
            <span>Shard</span>Note
        </div>

        <div class="menu">
            <button class="active" onclick="showPage('dashboard')">
                🏠 Dashboard
            </button>

            <button onclick="showPage('music')">
                🎵 Musik
            </button>

            <button onclick="showPage('messages')">
                💬 Beskeder
            </button>

            <button onclick="showPage('tickets')">
                🎫 Tickets
            </button>

            <button onclick="showPage('commands')">
                ⚙️ Commands
            </button>

            <button onclick="showPage('settings')">
                🔧 Indstillinger
            </button>
        </div>
    </aside>

    <main class="main">

        <div class="header">
            <h1>ShardNote Dashboard</h1>
            <p>Kontrolpanel til din Discord bot</p>
        </div>

        <section id="dashboard">

            <div class="cards">

                <div class="card">
                    <h3>BOT STATUS</h3>
                    <div class="value online">
                        ● Online
                    </div>
                </div>

                <div class="card">
                    <h3>SERVERE</h3>
                    <div class="value">
                        0
                    </div>
                </div>

                <div class="card">
                    <h3>BRUGERE</h3>
                    <div class="value">
                        0
                    </div>
                </div>

                <div class="card">
                    <h3>COMMANDS</h3>
                    <div class="value">
                        0
                    </div>
                </div>

            </div>

            <div class="content">
                <h2>Send command</h2>

                <div class="command-box">
                    <input
                        id="command"
                        type="text"
                        placeholder="Skriv en command..."
                    >

                    <button
                        class="send-button"
                        onclick="sendCommand()"
                    >
                        Send
                    </button>
                </div>

                <div id="result"></div>
            </div>

            <div class="content">
                <h2>Funktioner</h2>

                <div class="features">

                    <div class="feature">
                        <h3>🎵 Musik</h3>
                        <p>Afspil musik i Discord.</p>
                    </div>

                    <div class="feature">
                        <h3>🎫 Tickets</h3>
                        <p>Administrer ticketsystemet.</p>
                    </div>

                    <div class="feature">
                        <h3>💬 Beskeder</h3>
                        <p>Send beskeder til Discord-kanaler.</p>
                    </div>

                    <div class="feature">
                        <h3>⚙️ Commands</h3>
                        <p>Administrer bot commands.</p>
                    </div>

                </div>
            </div>

        </section>

    </main>

<script>

function sendCommand() {

    const command = document.getElementById("command").value;
    const result = document.getElementById("result");

    if (!command) {
        result.style.color = "#ff5555";
        result.innerText = "Skriv en command først.";
        return;
    }

    result.style.color = "#43d17a";
    result.innerText = "Command sendt: " + command;

    document.getElementById("command").value = "";
}


function showPage(page) {

    console.log("Åbner:", page);

    const buttons = document.querySelectorAll(".menu button");

    buttons.forEach(button => {
        button.classList.remove("active");
    });

    event.target.classList.add("active");
}

</script>

</body>
</html>
    `);
});

app.listen(PORT, () => {
    console.log(`ShardNote hjemmeside kører på port ${PORT}`);
});
