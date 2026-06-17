#include <amxmodx>
#include <file>

#define PLUGIN_NAME "ZM Web Exporter"
#define PLUGIN_VERSION "1.0.0"
#define PLUGIN_AUTHOR "Solpadoin / Codex"

#define EXPORT_TASK 74001
#define MAX_CHAT_LINES 128
#define MAX_EVENTS 96
#define UNIQUE_LOG_FILE "unique_players.log"

enum ChatLine
{
	ChatTime,
	ChatName[32],
	ChatTeam[12],
	ChatMessage[160]
}

enum EventLine
{
	EventTime,
	EventType[32],
	EventDetail[96]
}

new g_chat[MAX_CHAT_LINES][ChatLine];
new g_chatCount;

new g_events[MAX_EVENTS][EventLine];
new g_eventCount;

new g_roundState[32] = "waiting";
new g_exportDir[128] = "addons/amxmodx/data/zm_web";
new g_serverAddress[64] = "";
new g_chatWindowSeconds = 1800;
new g_exportInterval = 5;

public plugin_init()
{
	register_plugin(PLUGIN_NAME, PLUGIN_VERSION, PLUGIN_AUTHOR);

	register_cvar("zm_web_export_dir", g_exportDir);
	register_cvar("zm_web_server_address", "");
	register_cvar("zm_web_chat_window", "1800");
	register_cvar("zm_web_export_interval", "5");

	register_clcmd("say", "cmd_say");
	register_clcmd("say_team", "cmd_say_team");

	register_logevent("event_round_start", 2, "1=Round_Start");
	register_logevent("event_round_end", 2, "1=Round_End");
	register_event("HLTV", "event_new_round", "a", "1=0", "2=0");

	set_task(float(g_exportInterval), "task_export", EXPORT_TASK, _, _, "b");
}

public plugin_cfg()
{
	get_cvar_string("zm_web_export_dir", g_exportDir, charsmax(g_exportDir));
	get_cvar_string("zm_web_server_address", g_serverAddress, charsmax(g_serverAddress));
	g_chatWindowSeconds = max(60, get_cvar_num("zm_web_chat_window"));
	g_exportInterval = max(2, get_cvar_num("zm_web_export_interval"));

	ensure_export_dir();
	add_event_line("plugin_start", "ZM web exporter loaded");
	export_all();
}

public client_putinserver(id)
{
	if (!is_user_connected(id))
		return;

	new name[32];
	get_user_name(id, name, charsmax(name));
	add_event_line("client_connected", name);
	log_unique_player(id);
	export_all();
}

public client_disconnected(id)
{
	new name[32];
	get_user_name(id, name, charsmax(name));
	add_event_line("client_disconnected", name);
	export_all();
}

public event_new_round()
{
	copy(g_roundState, charsmax(g_roundState), "new_round");
	add_event_line("new_round", "New round initialized");
	export_all();
}

public event_round_start()
{
	copy(g_roundState, charsmax(g_roundState), "round_start");
	add_event_line("round_start", "Round started");
	export_all();
}

public event_round_end()
{
	copy(g_roundState, charsmax(g_roundState), "round_end");
	add_event_line("round_end", "Round ended");
	export_all();
}

public cmd_say(id)
{
	return handle_chat(id, false);
}

public cmd_say_team(id)
{
	return handle_chat(id, true);
}

public task_export()
{
	export_all();
}

handle_chat(id, bool:teamOnly)
{
	if (!is_user_connected(id))
		return PLUGIN_CONTINUE;

	new message[192];
	read_args(message, charsmax(message));
	remove_quotes(message);
	trim(message);

	if (!message[0])
		return PLUGIN_CONTINUE;

	add_chat_line(id, teamOnly, message);
	export_chat();

	return PLUGIN_CONTINUE;
}

add_chat_line(id, bool:teamOnly, const message[])
{
	if (g_chatCount >= MAX_CHAT_LINES)
	{
		for (new i = 1; i < MAX_CHAT_LINES; i++)
			g_chat[i - 1] = g_chat[i];

		g_chatCount = MAX_CHAT_LINES - 1;
	}

	new index = g_chatCount++;
	g_chat[index][ChatTime] = get_systime();
	get_user_name(id, g_chat[index][ChatName], charsmax(g_chat[][ChatName]));
	copy(g_chat[index][ChatTeam], charsmax(g_chat[][ChatTeam]), teamOnly ? "TEAM" : "ALL");
	copy(g_chat[index][ChatMessage], charsmax(g_chat[][ChatMessage]), message);
}

add_event_line(const type[], const detail[])
{
	if (g_eventCount >= MAX_EVENTS)
	{
		for (new i = 1; i < MAX_EVENTS; i++)
			g_events[i - 1] = g_events[i];

		g_eventCount = MAX_EVENTS - 1;
	}

	new index = g_eventCount++;
	g_events[index][EventTime] = get_systime();
	copy(g_events[index][EventType], charsmax(g_events[][EventType]), type);
	copy(g_events[index][EventDetail], charsmax(g_events[][EventDetail]), detail);
}

ensure_export_dir()
{
	if (!dir_exists(g_exportDir, false))
		mkdir(g_exportDir, FPERM_DIR_DEFAULT, false, "GAME");
}

build_path(const fileName[], output[], outputLen)
{
	formatex(output, outputLen, "%s/%s", g_exportDir, fileName);
}

log_unique_player(id)
{
	if (is_user_bot(id))
		return;

	new path[192], name[32], authid[40], cleanName[64], cleanAuth[64];
	build_path(UNIQUE_LOG_FILE, path, charsmax(path));

	get_user_name(id, name, charsmax(name));
	get_user_authid(id, authid, charsmax(authid));
	json_clean(name, cleanName, charsmax(cleanName));
	json_clean(authid, cleanAuth, charsmax(cleanAuth));

	for (new i = 0; cleanName[i]; i++)
	{
		if (cleanName[i] == 9)
			cleanName[i] = 32;
	}

	for (new i = 0; cleanAuth[i]; i++)
	{
		if (cleanAuth[i] == 9)
			cleanAuth[i] = 32;
	}

	new fp = fopen(path, "at");
	if (!fp)
		return;

	fprintf(fp, "%d^t%s^t%s^n", get_systime(), cleanAuth, cleanName);
	fclose(fp);
}

json_clean(const input[], output[], outputLen)
{
	new pos;
	for (new i = 0; input[i] && pos < outputLen - 1; i++)
	{
		new ch = input[i];
		if (ch == 34)
			output[pos++] = 39;
		else if (ch == 92)
			output[pos++] = 47;
		else if (ch < 32)
			output[pos++] = 32;
		else
			output[pos++] = ch;
	}
	output[pos] = 0;
}

team_string(id, output[], outputLen)
{
	switch (get_user_team(id))
	{
		case 1: copy(output, outputLen, "TERRORIST");
		case 2: copy(output, outputLen, "CT");
		case 3: copy(output, outputLen, "SPECTATOR");
		default: copy(output, outputLen, "UNASSIGNED");
	}
}

export_all()
{
	ensure_export_dir();
	export_status();
	export_players();
	export_chat();
	export_events();
}

export_status()
{
	new path[192];
	build_path("server_status.json", path, charsmax(path));

	new fp = fopen(path, "wt");
	if (!fp)
		return;

	new hostname[96], map[48], serverAddress[64], cleanHost[128], cleanMap[64], cleanAddress[96];
	get_cvar_string("hostname", hostname, charsmax(hostname));
	get_mapname(map, charsmax(map));
	get_server_address(serverAddress, charsmax(serverAddress));
	json_clean(hostname, cleanHost, charsmax(cleanHost));
	json_clean(map, cleanMap, charsmax(cleanMap));
	json_clean(serverAddress, cleanAddress, charsmax(cleanAddress));

	new players[32], playerCount;
	get_players(players, playerCount, "h");

	fprintf(fp, "{^n");
	fprintf(fp, "  ^"online^": true,^n");
	fprintf(fp, "  ^"hostname^": ^"%s^",^n", cleanHost);
	fprintf(fp, "  ^"address^": ^"%s^",^n", cleanAddress);
	fprintf(fp, "  ^"map^": ^"%s^",^n", cleanMap);
	fprintf(fp, "  ^"players_online^": %d,^n", playerCount);
	fprintf(fp, "  ^"players_max^": %d,^n", get_maxplayers());
	fprintf(fp, "  ^"round_state^": ^"%s^",^n", g_roundState);
	fprintf(fp, "  ^"updated_at^": %d^n", get_systime());
	fprintf(fp, "}^n");
	fclose(fp);
}

get_server_address(output[], outputLen)
{
	new address[64], ip[32], port[16];
	get_cvar_string("zm_web_server_address", g_serverAddress, charsmax(g_serverAddress));
	trim(g_serverAddress);

	if (g_serverAddress[0])
	{
		copy(output, outputLen, g_serverAddress);
		return;
	}

	get_cvar_string("net_address", address, charsmax(address));

	if (address[0] && containi(address, "0.0.0.0:") != 0)
	{
		copy(output, outputLen, address);
		return;
	}

	get_cvar_string("ip", ip, charsmax(ip));
	get_cvar_string("hostport", port, charsmax(port));

	if (!ip[0] || equali(ip, "0.0.0.0"))
	{
		copy(output, outputLen, "");
		return;
	}

	if (!port[0])
		copy(port, charsmax(port), "27015");

	formatex(output, outputLen, "%s:%s", ip, port);
}

export_players()
{
	new path[192];
	build_path("players.json", path, charsmax(path));

	new fp = fopen(path, "wt");
	if (!fp)
		return;

	new players[32], playerCount;
	get_players(players, playerCount, "h");

	fprintf(fp, "[^n");
	for (new i = 0; i < playerCount; i++)
	{
		new id = players[i];
		new name[32], authid[40], team[16], cleanName[64], cleanAuth[64];
		get_user_name(id, name, charsmax(name));
		get_user_authid(id, authid, charsmax(authid));
		team_string(id, team, charsmax(team));
		json_clean(name, cleanName, charsmax(cleanName));
		json_clean(authid, cleanAuth, charsmax(cleanAuth));

		fprintf(fp, "  { ^"name^": ^"%s^", ^"userid^": %d, ^"authid^": ^"%s^", ^"team^": ^"%s^", ^"alive^": %s, ^"bot^": %s }%s^n",
			cleanName,
			get_user_userid(id),
			cleanAuth,
			team,
			is_user_alive(id) ? "true" : "false",
			is_user_bot(id) ? "true" : "false",
			i == playerCount - 1 ? "" : ",");
	}
	fprintf(fp, "]^n");
	fclose(fp);
}

export_chat()
{
	new path[192];
	build_path("chat.json", path, charsmax(path));

	new fp = fopen(path, "wt");
	if (!fp)
		return;

	new now = get_systime();
	new written;
	fprintf(fp, "[^n");
	for (new i = 0; i < g_chatCount; i++)
	{
		if (g_chat[i][ChatTime] < now - g_chatWindowSeconds)
			continue;

		new cleanName[64], cleanTeam[24], cleanMessage[220];
		json_clean(g_chat[i][ChatName], cleanName, charsmax(cleanName));
		json_clean(g_chat[i][ChatTeam], cleanTeam, charsmax(cleanTeam));
		json_clean(g_chat[i][ChatMessage], cleanMessage, charsmax(cleanMessage));

		if (written)
			fprintf(fp, ",^n");

		fprintf(fp, "  { ^"time^": %d, ^"name^": ^"%s^", ^"team^": ^"%s^", ^"message^": ^"%s^" }",
			g_chat[i][ChatTime],
			cleanName,
			cleanTeam,
			cleanMessage);
		written++;
	}
	fprintf(fp, "^n]^n");
	fclose(fp);
}

export_events()
{
	new path[192];
	build_path("events.json", path, charsmax(path));

	new fp = fopen(path, "wt");
	if (!fp)
		return;

	fprintf(fp, "[^n");
	for (new i = 0; i < g_eventCount; i++)
	{
		new cleanType[48], cleanDetail[128];
		json_clean(g_events[i][EventType], cleanType, charsmax(cleanType));
		json_clean(g_events[i][EventDetail], cleanDetail, charsmax(cleanDetail));
		fprintf(fp, "  { ^"time^": %d, ^"type^": ^"%s^", ^"detail^": ^"%s^" }%s^n",
			g_events[i][EventTime],
			cleanType,
			cleanDetail,
			i == g_eventCount - 1 ? "" : ",");
	}
	fprintf(fp, "]^n");
	fclose(fp);
}
