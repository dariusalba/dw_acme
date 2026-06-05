const { FinancialInstrument, DataSource, TimeSeriesRecord, InstrumentVersion } = require('../models');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are the Acme Financial Data Warehouse assistant. You help users explore financial data stored in our platform.
Always use the available tools to fetch real data before answering — never make up prices, statistics, or instrument details.
Most tools accept either an internal instrument ID or a ticker symbol (e.g. "AAPL", "BTC"), so you can pass the symbol directly without first calling list_assets.
Be concise and data-driven. Format numbers clearly (e.g. $185.23, 2.3M volume).`;

// Tool definitions (MCP-style, exposed via /assistant/tools)
const TOOL_DEFINITIONS = [
  {
    name: 'list_assets',
    description: 'List all financial instruments available in the data warehouse',
    parameters: {}
  },
  {
    name: 'get_asset',
    description: 'Get full details of a financial instrument by its ID or symbol',
    parameters: { identifier: 'string (ID or symbol)' }
  },
  {
    name: 'list_data_sources',
    description: 'List all data sources/vendors in the system',
    parameters: {}
  },
  {
    name: 'fetch_time_series',
    description: 'Fetch time series data for an instrument from a specific data source',
    parameters: { instrumentId: 'string', dataSourceId: 'string (optional)', startDate: 'string (optional)', endDate: 'string (optional)', limit: 'number (optional)' }
  },
  {
    name: 'summarize_trends',
    description: 'Get aggregate statistics and trend summary for an instrument',
    parameters: { instrumentId: 'string', startDate: 'string (optional)', endDate: 'string (optional)' }
  },
  {
    name: 'compare_assets',
    description: 'Compare statistics of two instruments side by side',
    parameters: { instrumentId1: 'string', instrumentId2: 'string' }
  },
  {
    name: 'forecast_price',
    description: 'Get a simple moving average forecast for an instrument',
    parameters: { instrumentId: 'string', window: 'number (optional, default 5)' }
  },
  {
    name: 'get_risk_metrics',
    description: 'Get volatility and risk metrics for an instrument',
    parameters: { instrumentId: 'string' }
  }
];

//Anthropic tool schema (used when calling the API)
const ANTHROPIC_TOOLS = [
  {
    name: 'list_assets',
    description: 'List all financial instruments available in the Acme data warehouse. Returns symbol, class, name, exchange for each.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'get_asset',
    description: 'Get full details of a specific financial instrument by its ticker symbol (e.g. AAPL, MSFT, BTC) or internal ID.',
    input_schema: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Ticker symbol (e.g. AAPL) or internal instrument ID' }
      },
      required: ['identifier']
    }
  },
  {
    name: 'list_data_sources',
    description: 'List all financial data vendors/sources registered in the warehouse (e.g. Nasdaq, Bloomberg, Yahoo Finance).',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'fetch_time_series',
    description: 'Fetch historical price time-series records for an instrument. Returns open, close, high, low, volume per day.',
    input_schema: {
      type: 'object',
      properties: {
        instrumentId: { type: 'string', description: 'Internal instrument ID OR ticker symbol (e.g. "AAPL", "NVDA", "BTC")' },
        dataSourceId: { type: 'string', description: 'Optional: filter by a specific data source ID' },
        startDate: { type: 'string', description: 'Optional: ISO date string start of range' },
        endDate: { type: 'string', description: 'Optional: ISO date string end of range' },
        limit: { type: 'number', description: 'Optional: max records to return (default 20)' }
      },
      required: ['instrumentId']
    }
  },
  {
    name: 'summarize_trends',
    description: 'Get aggregate statistics for an instrument: avg/min/max price, volume, date range, data point count.',
    input_schema: {
      type: 'object',
      properties: {
        instrumentId: { type: 'string', description: 'Internal instrument ID OR ticker symbol (e.g. "AAPL", "NVDA", "BTC")' },
        startDate: { type: 'string', description: 'Optional: start of analysis period' },
        endDate: { type: 'string', description: 'Optional: end of analysis period' }
      },
      required: ['instrumentId']
    }
  },
  {
    name: 'compare_assets',
    description: 'Compare key statistics of two instruments side-by-side: avg price, volume, range, data coverage.',
    input_schema: {
      type: 'object',
      properties: {
        instrumentId1: { type: 'string', description: 'First instrument — internal ID or ticker symbol (e.g. "AAPL")' },
        instrumentId2: { type: 'string', description: 'Second instrument — internal ID or ticker symbol (e.g. "MSFT")' }
      },
      required: ['instrumentId1', 'instrumentId2']
    }
  },
  {
    name: 'forecast_price',
    description: 'Generate a simple moving-average price forecast for the next trading day.',
    input_schema: {
      type: 'object',
      properties: {
        instrumentId: { type: 'string', description: 'Internal instrument ID OR ticker symbol (e.g. "AAPL", "NVDA", "BTC")' },
        window: { type: 'number', description: 'Number of recent days to average (default 5)' }
      },
      required: ['instrumentId']
    }
  },
  {
    name: 'get_risk_metrics',
    description: 'Get volatility and risk metrics for an instrument: daily return std-dev, max drawdown, and a risk category.',
    input_schema: {
      type: 'object',
      properties: {
        instrumentId: { type: 'string', description: 'Internal instrument ID' }
      },
      required: ['instrumentId']
    }
  }
];

// OpenAI / Groq tool schema — derived from ANTHROPIC_TOOLS so we only maintain one source of truth
const OPENAI_TOOLS = ANTHROPIC_TOOLS.map(t => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.input_schema,
  },
}));

// Resolve either an internal _id or a ticker symbol to the canonical _id.
// LLMs frequently pass the symbol ("NVDA") instead of the UUID even when told otherwise,
// so we accept both transparently.
async function resolveInstrumentId(idOrSymbol) {
  if (!idOrSymbol) return null;
  let inst = await FinancialInstrument.findById(idOrSymbol).select('_id').lean();
  if (inst) return inst._id;
  inst = await FinancialInstrument.findOne({ symbol: String(idOrSymbol).toUpperCase() }).select('_id').lean();
  return inst ? inst._id : null;
}

//Tool execution (all queries hit the real DB).
// `forLLM` trims large payloads to reduce token usage when piped into a chat completion.
async function executeTool(toolName, params, forLLM = false) {
  switch (toolName) {
    case 'list_assets': {
      // Direct API consumers get full metadata; LLM agentic loop gets a slim version
      // (just _id + symbol + instrumentClass) to keep conversation tokens small.
      const projection = forLLM
        ? '_id symbol instrumentClass'
        : '_id symbol instrumentClass name exchange region';
      return await FinancialInstrument.find().select(projection).lean();
    }

    case 'get_asset': {
      const { identifier } = params;
      let instrument = await FinancialInstrument.findById(identifier).lean();
      if (!instrument) {
        instrument = await FinancialInstrument.findOne({ symbol: identifier.toUpperCase() }).lean();
      }
      if (!instrument) return { error: 'Instrument not found' };

      const version = await InstrumentVersion.findOne({
        instrumentId: instrument._id,
        isDeleted: { $ne: true },
        validFrom: { $lte: new Date() },
        $or: [{ validTo: null }, { validTo: { $gt: new Date() } }]
      }).sort({ validFrom: -1 }).lean();

      return { ...instrument, currentVersion: version };
    }

    case 'list_data_sources': {
      const projection = forLLM ? '_id vendorName licenseType' : null;
      const q = DataSource.find();
      if (projection) q.select(projection);
      return await q.lean();
    }

    case 'fetch_time_series': {
      const resolvedId = await resolveInstrumentId(params.instrumentId);
      if (!resolvedId) return { error: `Instrument not found: ${params.instrumentId}` };
      const query = { instrumentId: resolvedId };
      if (params.dataSourceId) query.dataSourceId = params.dataSourceId;
      if (params.startDate || params.endDate) {
        query.date = {};
        if (params.startDate) query.date.$gte = new Date(params.startDate);
        if (params.endDate) query.date.$lte = new Date(params.endDate);
      }
      // Default 20 for direct API calls; LLM agentic loop gets 10 to save tokens
      const limit = params.limit || (forLLM ? 10 : 20);
      const records = await TimeSeriesRecord.find(query).sort({ date: -1 }).limit(limit).lean();
      return records.map(r => ({
        date: r.date,
        open: r.open ? parseFloat(r.open.toString()) : null,
        close: r.close ? parseFloat(r.close.toString()) : null,
        high: r.high ? parseFloat(r.high.toString()) : null,
        low: r.low ? parseFloat(r.low.toString()) : null,
        volume: r.volume ? parseFloat(r.volume.toString()) : null
      }));
    }

    case 'summarize_trends': {
      const resolvedId = await resolveInstrumentId(params.instrumentId);
      if (!resolvedId) return { error: `Instrument not found: ${params.instrumentId}` };
      const match = { instrumentId: resolvedId };
      if (params.startDate || params.endDate) {
        match.date = {};
        if (params.startDate) match.date.$gte = new Date(params.startDate);
        if (params.endDate) match.date.$lte = new Date(params.endDate);
      }

      const stats = await TimeSeriesRecord.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$instrumentId',
            count: { $sum: 1 },
            avgClose: { $avg: { $toDouble: '$close' } },
            minLow: { $min: { $toDouble: '$low' } },
            maxHigh: { $max: { $toDouble: '$high' } },
            avgVolume: { $avg: { $toDouble: '$volume' } },
            firstDate: { $min: '$date' },
            lastDate: { $max: '$date' }
          }
        }
      ]);

      return stats.length > 0 ? stats[0] : { message: 'No data found for this instrument' };
    }

    case 'compare_assets': {
      const id1 = await resolveInstrumentId(params.instrumentId1);
      const id2 = await resolveInstrumentId(params.instrumentId2);
      if (!id1 || !id2) return { error: `Could not resolve one of: ${params.instrumentId1}, ${params.instrumentId2}` };
      const results = await TimeSeriesRecord.aggregate([
        { $match: { instrumentId: { $in: [id1, id2] } } },
        {
          $group: {
            _id: '$instrumentId',
            count: { $sum: 1 },
            avgClose: { $avg: { $toDouble: '$close' } },
            minLow: { $min: { $toDouble: '$low' } },
            maxHigh: { $max: { $toDouble: '$high' } },
            avgVolume: { $avg: { $toDouble: '$volume' } }
          }
        }
      ]);

      const instruments = await FinancialInstrument.find({
        _id: { $in: [id1, id2] }
      }).lean();

      return instruments.map(inst => ({
        instrument: inst,
        stats: results.find(r => r._id === inst._id) || null
      }));
    }

    case 'forecast_price': {
      const resolvedId = await resolveInstrumentId(params.instrumentId);
      if (!resolvedId) return { error: `Instrument not found: ${params.instrumentId}` };
      const window = params.window || 5;
      const records = await TimeSeriesRecord.find({ instrumentId: resolvedId })
        .sort({ date: -1 })
        .limit(window)
        .lean();

      if (records.length === 0) return { message: 'No data available for forecast' };

      const closes = records.map(r => parseFloat(r.close.toString()));
      const avg = closes.reduce((a, b) => a + b, 0) / closes.length;
      const nextDate = new Date(records[0].date);
      nextDate.setDate(nextDate.getDate() + 1);

      return {
        method: `SMA-${window}`,
        forecastedClose: Math.round(avg * 100) / 100,
        basedOn: closes,
        lastDate: records[0].date,
        forecastDate: nextDate
      };
    }

    case 'get_risk_metrics': {
      const resolvedId = await resolveInstrumentId(params.instrumentId);
      if (!resolvedId) return { error: `Instrument not found: ${params.instrumentId}` };
      const records = await TimeSeriesRecord.find({ instrumentId: resolvedId })
        .sort({ date: 1 })
        .lean();

      if (records.length < 2) return { message: 'Insufficient data for risk metrics' };

      const closes = records.map(r => parseFloat(r.close.toString()));
      const returns = [];
      for (let i = 1; i < closes.length; i++) {
        returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
      }

      const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / returns.length;
      const volatility = Math.sqrt(variance) * Math.sqrt(252);

      let peak = closes[0];
      let maxDrawdown = 0;
      for (const c of closes) {
        if (c > peak) peak = c;
        const dd = (peak - c) / peak;
        if (dd > maxDrawdown) maxDrawdown = dd;
      }

      const riskCategory = volatility < 0.15 ? 'Low' : volatility < 0.35 ? 'Medium' : 'High';

      return {
        instrumentId: resolvedId,
        dataPoints: records.length,
        annualizedVolatility: Math.round(volatility * 10000) / 100,
        maxDrawdownPct: Math.round(maxDrawdown * 10000) / 100,
        avgDailyReturn: Math.round(meanReturn * 10000) / 100,
        riskCategory
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// Claude API call via native fetch
async function callClaudeAPI(messages, tools) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      tools
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  return response.json();
}

// ── Agentic loop: Claude calls tools until it produces a final answer ─────────
async function runAgenticLoop(userMessage) {
  const messages = [{ role: 'user', content: userMessage }];
  const MAX_ROUNDS = 6;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await callClaudeAPI(messages, ANTHROPIC_TOOLS);

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock ? textBlock.text : 'No response generated.';
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;
        let result;
        try {
          result = await executeTool(block.name, block.input, true);
        } catch (err) {
          result = { error: err.message };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      }
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    break;
  }

  return 'Maximum reasoning steps reached. Please try a more specific question.';
}

// ── Groq (OpenAI-compatible) API call ────────────────────────────────────────
async function callGroqAPI(messages, tools) {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }
  return response.json();
}

// ── Agentic loop using Groq / OpenAI tool-calling format ──────────────────────
async function runGroqAgenticLoop(userMessage) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: userMessage  },
  ];
  const MAX_ROUNDS = 6;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await callGroqAPI(messages, OPENAI_TOOLS);
    const choice  = response.choices?.[0];
    if (!choice) return 'No response generated.';

    const msg = choice.message;
    messages.push(msg);

    if (choice.finish_reason === 'tool_calls' && Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
      for (const call of msg.tool_calls) {
        let args = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* ignore */ }
        let result;
        try {
          result = await executeTool(call.function.name, args, true);
        } catch (err) {
          result = { error: err.message };
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // finish_reason === 'stop' (or anything else terminal) → return the text answer
    return msg.content || 'No response generated.';
  }

  return 'Maximum reasoning steps reached. Please try a more specific question.';
}

//Route handlers
async function getTools(req, res) {
  res.json({ tools: TOOL_DEFINITIONS });
}

async function callTool(req, res) {
  try {
    const { tool, params } = req.body;
    if (!tool) return res.status(400).json({ error: 'tool name is required' });
    const result = await executeTool(tool, params || {});
    res.json({ tool, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function chat(req, res) {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    // Provider priority: Anthropic → Groq → keyword fallback
    if (ANTHROPIC_API_KEY) {
      const answer = await runAgenticLoop(message);
      return res.json({
        query: message,
        provider: 'anthropic',
        responses: [{ action: 'llm_response', text: answer }],
      });
    }
    if (GROQ_API_KEY) {
      const answer = await runGroqAgenticLoop(message);
      return res.json({
        query: message,
        provider: 'groq',
        responses: [{ action: 'llm_response', text: answer }],
      });
    }
    return fallbackChat(req, res, message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

//Rule-based fallback (used when ANTHROPIC_API_KEY is not set)
async function fallbackChat(req, res, message) {
  const lowerMsg = message.toLowerCase();
  const responses = [];

  if (lowerMsg.includes('list') && (lowerMsg.includes('asset') || lowerMsg.includes('instrument'))) {
    const assets = await executeTool('list_assets', {});
    responses.push({ action: 'list_assets', data: assets, text: `Found ${assets.length} financial instruments in the data warehouse.` });
  }

  if (lowerMsg.includes('list') && (lowerMsg.includes('source') || lowerMsg.includes('vendor') || lowerMsg.includes('provider'))) {
    const sources = await executeTool('list_data_sources', {});
    responses.push({ action: 'list_data_sources', data: sources, text: `Found ${sources.length} data sources.` });
  }

  if (lowerMsg.includes('compare')) {
    const symbolRegex = /\b([A-Z]{2,5})\b/g;
    const symbols = [...message.matchAll(symbolRegex)].map(m => m[1]);
    if (symbols.length >= 2) {
      const inst1 = await FinancialInstrument.findOne({ symbol: symbols[0] });
      const inst2 = await FinancialInstrument.findOne({ symbol: symbols[1] });
      if (inst1 && inst2) {
        const comparison = await executeTool('compare_assets', { instrumentId1: inst1._id, instrumentId2: inst2._id });
        responses.push({ action: 'compare_assets', data: comparison, text: `Comparison between ${symbols[0]} and ${symbols[1]}:` });
      }
    }
  }

  if (lowerMsg.includes('forecast') || lowerMsg.includes('predict')) {
    const symbolRegex = /\b([A-Z]{2,5})\b/g;
    const symbols = [...message.matchAll(symbolRegex)].map(m => m[1]);
    if (symbols.length > 0) {
      const inst = await FinancialInstrument.findOne({ symbol: symbols[0] });
      if (inst) {
        const forecast = await executeTool('forecast_price', { instrumentId: inst._id });
        responses.push({ action: 'forecast_price', data: forecast, text: `Price forecast for ${symbols[0]}:` });
      }
    }
  }

  if (lowerMsg.includes('risk') || lowerMsg.includes('volatil')) {
    const symbolRegex = /\b([A-Z]{2,5})\b/g;
    const symbols = [...message.matchAll(symbolRegex)].map(m => m[1]);
    if (symbols.length > 0) {
      const inst = await FinancialInstrument.findOne({ symbol: symbols[0] });
      if (inst) {
        const risk = await executeTool('get_risk_metrics', { instrumentId: inst._id });
        responses.push({ action: 'get_risk_metrics', data: risk, text: `Risk metrics for ${symbols[0]}:` });
      }
    }
  }

  if (lowerMsg.includes('trend') || lowerMsg.includes('summary') || lowerMsg.includes('summarize')) {
    const symbolRegex = /\b([A-Z]{2,5})\b/g;
    const symbols = [...message.matchAll(symbolRegex)].map(m => m[1]);
    if (symbols.length > 0) {
      const inst = await FinancialInstrument.findOne({ symbol: symbols[0] });
      if (inst) {
        const trends = await executeTool('summarize_trends', { instrumentId: inst._id });
        responses.push({ action: 'summarize_trends', data: trends, text: `Trend summary for ${symbols[0]}:` });
      }
    }
  }

  if ((lowerMsg.includes('time series') || lowerMsg.includes('price') || lowerMsg.includes('data')) && responses.length === 0) {
    const symbolRegex = /\b([A-Z]{2,5})\b/g;
    const symbols = [...message.matchAll(symbolRegex)].map(m => m[1]);
    if (symbols.length > 0) {
      const inst = await FinancialInstrument.findOne({ symbol: symbols[0] });
      if (inst) {
        const series = await executeTool('fetch_time_series', { instrumentId: inst._id, limit: 10 });
        responses.push({ action: 'fetch_time_series', data: series, text: `Recent time series data for ${symbols[0]}:` });
      }
    }
  }

  if (responses.length === 0) {
    responses.push({
      action: 'help',
      data: TOOL_DEFINITIONS,
      text: 'I can help you explore financial data. Try: list assets, list data sources, compare AAPL and MSFT, forecast TSLA, summarize trends for BTC, risk metrics for ETH.'
    });
  }

  res.json({ query: message, responses });
}

module.exports = { getTools, callTool, chat };
