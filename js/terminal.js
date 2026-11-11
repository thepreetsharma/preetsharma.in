// A small zsh-flavoured terminal that knows a few things about Preet.
const PROMPT = "preet@preetsharma.in ~ %";

export function createTerminal(root, { email, quote, go, local }) {
  if (!root) return;
  const screen = root.querySelector("[data-term-screen]");
  const out = root.querySelector("[data-term-out]");
  const form = root.querySelector("[data-term-form]");
  const input = form.querySelector("input");
  const past = [];
  let recall = 0;

  const span = (text, tone) => {
    const el = document.createElement("span");
    if (tone) el.className = tone;
    el.textContent = text;
    return el;
  };
  const link = (text, href) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = text;
    return a;
  };
  const print = (parts, tone) => {
    const row = document.createElement("div");
    row.className = tone ? `term-line ${tone}` : "term-line";
    row.append(...[].concat(parts));
    out.append(row);
    screen.scrollTop = screen.scrollHeight;
  };

  // `cd` targets map to section ids on the page
  const PLACES = {
    open: "open",
    history: "history",
    portfolio: "portfolio",
    terminal: "terminal",
    close: "close",
    contact: "close",
    notebook: "close",
    "~": "open",
    "/": "open",
    "..": "open",
  };
  const LISTINGS = {
    "": ["history/", "portfolio/", "notebook/", "contact.txt"],
    history: ["electronics/", "economics/", "history+philosophy/", "gipe/"],
    portfolio: ["web-development/", "game-development/", "data-analysis/", "investment-management/", "machine-learning/"],
    notebook: [],
  };

  // Commands with an `about` show up in `help`; the rest are for the curious
  const COMMANDS = {
    help: {
      about: "list the commands",
      run() {
        for (const [name, command] of Object.entries(COMMANDS)) {
          if (command.about) print([span(name.padEnd(10), "t-bright"), span(command.about, "t-dim")]);
        }
      },
    },
    whoami: {
      about: "who's this?",
      run() {
        print("Preet Sharma: an economist at heart and a self-proclaimed generalist.", "t-bright");
      },
    },
    about: {
      about: "the short version",
      run() {
        [
          "Started in electronics after high school; switched to economics at 18.",
          "Undergrad in economics, plus history and philosophy for the joy of it.",
          "Now a grad student at GIPE: geopolitics and geoeconomics.",
          "Finance nerd: derivatives, financial modeling, quantitative methods.",
          "Writing code for 5+ years: web, games, data, machine learning.",
        ].forEach((text) => print(text));
      },
    },
    ls: {
      about: "list what's here",
      run([dir = ""]) {
        const key = dir.replace(/\/$/, "");
        const items = LISTINGS[key];
        if (!items) return print(`ls: ${dir}: No such file or directory`, "t-down");
        if (!items.length) return print("(empty: the first entries are being drafted)", "t-dim");
        print(items.join("  "), "t-bright");
        if (key === "portfolio") print("(individual projects listing soon)", "t-dim");
      },
    },
    cd: {
      about: "jump to a section, e.g. cd portfolio",
      run([dir = "~"]) {
        const id = PLACES[dir.replace(/\/$/, "")];
        if (!id) return print(`cd: no such file or directory: ${dir}`, "t-down");
        print(`→ ${id}`, "t-dim");
        setTimeout(() => go(id), 250);
      },
    },
    cat: {
      run([file = ""]) {
        if (file === "contact.txt") return COMMANDS.contact.run();
        print(`cat: ${file || "missing operand"}: No such file or directory`, "t-down");
      },
    },
    contact: {
      about: "how to reach me",
      run() {
        print(["email   ", link(email, `mailto:${email}`)]);
      },
    },
    quote: {
      about: "a line I like",
      run() {
        print("“He must be mathematician, historian, statesman, philosopher—in some degree.”");
        print("  — John Maynard Keynes", "t-dim");
      },
    },
    price: {
      about: "check the PRT ticker",
      run() {
        const q = quote();
        const rising = q.change >= 0;
        print([
          span("PRT  ", "t-bright"),
          span(`${q.price}  `, "t-bright"),
          span(`${rising ? "▲" : "▼"} ${Math.abs(q.change).toFixed(2)}% since the open`, rising ? "t-up" : "t-down"),
        ]);
        print("Not investment advice.", "t-dim");
      },
    },
    date: {
      about: `the time in ${local.city}`,
      run() {
        print(local.time());
      },
    },
    weather: {
      about: `the weather in ${local.city}`,
      run() {
        local.weather().then((report) => print(report || "Weather is unavailable right now.", report ? "" : "t-dim"));
      },
    },
    clear: {
      about: "clear the screen",
      run() {
        out.replaceChildren();
      },
    },
    history: {
      run() {
        past.forEach((cmd, i) => print(`${String(i + 1).padStart(4)}  ${cmd}`, "t-dim"));
      },
    },
    echo: {
      run(args) {
        print(args.join(" "));
      },
    },
    sudo: {
      run() {
        print("Nice try. This incident will be reported to the RBI.", "t-down");
      },
    },
    exit: {
      run() {
        print("There's no exit, only the closing bell. Try: cd close", "t-dim");
      },
    },
  };

  function run(raw) {
    const text = raw.trim();
    print([span(`${PROMPT} `, "t-prompt"), text]);
    if (text) past.push(text);
    recall = past.length;
    if (!text) return;
    const [name, ...args] = text.split(/\s+/);
    const command = COMMANDS[name.toLowerCase()];
    if (!command) {
      print(`zsh: command not found: ${name}`, "t-down");
      print("Try: help", "t-dim");
      return;
    }
    command.run(args);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(input.value);
    input.value = "";
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (!past.length) return;
      event.preventDefault();
      recall = Math.max(0, Math.min(past.length, recall + (event.key === "ArrowUp" ? -1 : 1)));
      input.value = past[recall] ?? "";
    } else if (event.key === "Tab" && input.value.trim() && !input.value.trim().includes(" ")) {
      // Complete command names; an empty prompt keeps Tab for normal keyboard navigation
      const head = input.value.trim().toLowerCase();
      const matches = Object.keys(COMMANDS).filter((name) => name.startsWith(head));
      if (!matches.length) return;
      event.preventDefault();
      if (matches.length === 1) input.value = `${matches[0]} `;
      else print(matches.join("  "), "t-dim");
    } else if (event.key === "l" && event.ctrlKey) {
      event.preventDefault();
      out.replaceChildren();
    }
  });

  screen.addEventListener("click", (event) => {
    if (event.target.closest("a") || getSelection()?.toString()) return;
    input.focus({ preventScroll: true });
  });

  print(`Last login: ${local.stamp()} on ttys001`, "t-dim");
  print(["Hi, I'm Preet. Type ", span("help", "t-bright"), " to see what I can tell you."]);
}
