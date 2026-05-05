import { getManifest } from 'robo.js';
import { MessageFlags, EmbedBuilder, Colors, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const COMMANDS_PER_PAGE = 20;
const NAMESPACE = "__robo.js__default__helpmenu";
const config = {
  description: "Displays a list of commands.",
  options: [
    {
      name: "command",
      description: "Select a command to view details.",
      type: "string",
      autocomplete: true,
      required: false
    },
    {
      name: "category",
      description: "Filter commands by category.",
      type: "string",
      required: false,
      autocomplete: true
    }
  ]
};
var help_default = async (interaction) => {
  const manifest = getManifest();
  const commands = getInnermostCommands(manifest.commands);
  const query = interaction.options.get("command")?.value;
  const category = interaction.options.get("category")?.value;
  const queriedCmd = commands.filter((cmd) => cmd.key == query)[0];
  if (queriedCmd) {
    return {
      embeds: [createCommandEmbed(queriedCmd)]
    };
  } else {
    const categorizedCommands = categorizeCommands(commands);
    const categories = Object.keys(categorizedCommands);
    const filteredCommands = category ? categorizedCommands[category] || [] : commands;
    const page = 0;
    const totalPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE);
    return {
      embeds: [createEmbed(filteredCommands, page, totalPages, category)],
      components: [
        createCategoryMenu(categories, category, interaction.user.id),
        ...totalPages > 1 ? [createPaginationButtons(page, totalPages, category, interaction.user.id)] : []
      ]
    };
  }
};
const autocomplete = (interaction) => {
  const focusedOption = interaction.options.getFocused(true);
  const manifest = getManifest();
  const commands = getInnermostCommands(manifest.commands);
  if (focusedOption.name === "category") {
    const query = (focusedOption.value || "").toLowerCase().trim();
    const categories = getCategoryList(commands);
    if (!query) {
      return categories.map((cat) => ({ name: cat, value: cat })).slice(0, 24);
    } else {
      const results = categories.filter((cat) => cat.toLowerCase().includes(query));
      return results.map((cat) => ({ name: cat, value: cat })).slice(0, 24);
    }
  } else {
    const query = (focusedOption.value ?? "").replace("/", "").toLowerCase().trim();
    if (!query) {
      return commands.map((cmd) => ({ name: `/${cmd.key}`, value: cmd.key })).slice(0, 24);
    } else {
      const results = commands.filter((cmd) => cmd.key.toLowerCase().includes(query));
      return results.map((cmd) => ({ name: `/${cmd.key}`, value: cmd.key })).slice(0, 24);
    }
  }
};
function getInnermostCommands(commands, prefix = "", categoryPath = "") {
  let innermostCommands = [];
  const keys = Object.keys(commands);
  for (const key of keys) {
    if (commands[key].subcommands) {
      const subCommandPrefix = prefix ? `${prefix} ${key}` : key;
      const subCategoryPath = categoryPath || key;
      const subInnermostCommands = getInnermostCommands(commands[key].subcommands, subCommandPrefix, subCategoryPath);
      innermostCommands = innermostCommands.concat(subInnermostCommands);
    } else {
      const commandPath = prefix ? `${prefix} ${key}` : key;
      const pathParts = commandPath.split(" ");
      const category = categoryPath || (pathParts.length > 1 ? pathParts[0] : "General");
      innermostCommands.push({ key: commandPath, command: commands[key], category });
    }
  }
  return innermostCommands;
}
function categorizeCommands(commands) {
  const categorized = {};
  for (const cmd of commands) {
    const category = cmd.category || "General";
    if (!categorized[category]) {
      categorized[category] = [];
    }
    categorized[category].push(cmd);
  }
  return categorized;
}
function getCategoryList(commands) {
  const categories = /* @__PURE__ */ new Set();
  for (const cmd of commands) {
    categories.add(cmd.category || "General");
  }
  return Array.from(categories).sort();
}
function createCommandEmbed({ key, command }) {
  const poweredBy = process.env.ROBOPLAY_HOST ? "Powered by [**RoboPlay** \u2728](https://roboplay.dev)" : "Powered by [**Robo.js**](https://robojs.dev)";
  const embed = new EmbedBuilder().setTitle(`/${key}`).setColor(Colors.Blurple).setDescription(`${command.description || "No description provided."}

> ${poweredBy}`);
  if (command.options && command.options.length > 0) {
    const optionsDescription = command.options.map((option) => {
      const required = option.required ? "Required" : "Optional";
      const autocomplete2 = option.autocomplete ? "Suggested" : "";
      const choicable = option.choices?.length ? "Choosable" : "";
      const type = option.type ? `${option.type.charAt(0).toUpperCase() + option.type.slice(1)}` : "";
      return `**${option.name}**: ${option.description || "No description"} (${[
        autocomplete2 || choicable,
        required,
        type
      ].join(" ").trim()})`;
    }).join("\n");
    embed.addFields({ name: "__Options__", value: optionsDescription });
  }
  return embed;
}
function createEmbed(commands, page, totalPages, category) {
  const poweredBy = process.env.ROBOPLAY_HOST ? "Powered by [**RoboPlay** \u2728](https://roboplay.dev)" : "Powered by [**Robo.js**](https://robojs.dev)";
  const start = page * COMMANDS_PER_PAGE;
  const end = start + COMMANDS_PER_PAGE;
  const pageCommands = commands.slice(start, end);
  const title = category ? `Commands: ${category}` : "Commands";
  return new EmbedBuilder().setTitle(title).setColor(Colors.Blurple).addFields(
    ...pageCommands.map(({ key, command }) => ({
      name: `/${key}`,
      value: command.description || "No description provided.",
      inline: false
    })),
    { name: "\u200B", value: poweredBy, inline: false }
  ).setFooter(
    totalPages > 1 ? {
      text: `Page: ${page + 1} / ${totalPages}`
    } : null
  );
}
function createCategoryMenu(categories, selectedCategory, userId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`${NAMESPACE}@category@${selectedCategory || "all"}@${userId}`).setPlaceholder("Select a category").addOptions([
      {
        label: "All Commands",
        value: "all",
        default: !selectedCategory
      },
      ...categories.map((category) => ({
        label: category,
        value: category,
        default: category === selectedCategory
      }))
    ])
  );
}
function createPaginationButtons(page, totalPages, category, user) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${NAMESPACE}@previous@${page}@${user}@${category || "all"}`).setEmoji("\u23EA").setStyle(ButtonStyle.Primary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`${NAMESPACE}@next@${page}@${user}@${category || "all"}`).setEmoji("\u23ED").setStyle(ButtonStyle.Primary).setDisabled(page === totalPages - 1)
  );
}
async function handleHelpMenuInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
    return;
  }
  const parts = interaction.customId.split("@");
  const prefix = parts[0];
  const action = parts[1];
  if (prefix !== NAMESPACE) {
    return;
  }
  const userId = parts[3];
  if (userId.toString() !== interaction.user.id.toString()) {
    return await interaction.reply(
      withEphemeralReply(
        {
          content: "This isn't the help menu. Use `/help` to access the list of commands."
        },
        true
      )
    );
  }
  const manifest = getManifest();
  const commands = getInnermostCommands(manifest.commands);
  if (interaction.isStringSelectMenu()) {
    const selectedCategory = interaction.values[0];
    const categorizedCommands = categorizeCommands(commands);
    const categories = Object.keys(categorizedCommands);
    const filteredCommands = selectedCategory === "all" ? commands : categorizedCommands[selectedCategory] || [];
    const page = 0;
    const totalPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE);
    await interaction.update({
      embeds: [
        createEmbed(filteredCommands, page, totalPages, selectedCategory === "all" ? void 0 : selectedCategory)
      ],
      components: [
        createCategoryMenu(categories, selectedCategory === "all" ? void 0 : selectedCategory, interaction.user.id),
        ...totalPages > 1 ? [
          createPaginationButtons(
            page,
            totalPages,
            selectedCategory === "all" ? void 0 : selectedCategory,
            interaction.user.id
          )
        ] : []
      ]
    });
    return;
  }
  if (interaction.isButton()) {
    let page = parseInt(parts[2], 10) || 0;
    const category = parts[4] === "all" ? void 0 : parts[4];
    const categorizedCommands = categorizeCommands(commands);
    const categories = Object.keys(categorizedCommands);
    const filteredCommands = category ? categorizedCommands[category] || [] : commands;
    const totalPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE);
    if (action === "previous" && page > 0) {
      page--;
    } else if (action === "next" && page < totalPages - 1) {
      page++;
    }
    await interaction.update({
      embeds: [createEmbed(filteredCommands, page, totalPages, category)],
      components: [
        createCategoryMenu(categories, category, interaction.user.id),
        createPaginationButtons(page, totalPages, category, interaction.user.id)
      ]
    });
  }
}
const supportsEphemeralFlag = typeof MessageFlags !== "undefined" && MessageFlags?.Ephemeral != null;
function withEphemeralReply(opts, on = true) {
  if (!on) return opts;
  if (supportsEphemeralFlag) opts.flags = MessageFlags.Ephemeral;
  else opts.ephemeral = true;
  return opts;
}

export { autocomplete, config, help_default as default, handleHelpMenuInteraction, withEphemeralReply };
