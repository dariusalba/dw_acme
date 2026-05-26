import { useState, useRef, useEffect } from 'react';
import { assistantApi } from '../services/api';

export default function Assistant() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am the Acme Financial Data Assistant, powered by Claude AI with real-time access to the data warehouse.\n\nI use MCP-style tool calling to query live data — I never make up numbers.\n\nTry asking:\n- List all assets in the warehouse\n- What are the risk metrics for TSLA?\n- Compare AAPL and MSFT performance\n- Forecast the price for BTC\n- Summarize trends for ETH over the last quarter\n- What data sources do we have?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await assistantApi.chat(userMessage);
      const data = res.data;

      let responseText = '';

      // New LLM response: single text block from Claude
      if (data.responses?.length === 1 && data.responses[0].action === 'llm_response') {
        responseText = data.responses[0].text;
      } else {
        // Legacy rule-based format
        for (const response of data.responses) {
          responseText += response.text + '\n\n';
          if (response.data && Array.isArray(response.data)) {
            if (response.data.length <= 10) {
              responseText += formatData(response.data, response.action);
            } else {
              responseText += formatData(response.data.slice(0, 10), response.action);
              responseText += `\n... and ${response.data.length - 10} more items.`;
            }
          } else if (response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
            responseText += formatObject(response.data, response.action);
          }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: responseText.trim() }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.response?.data?.error || err.message}`
      }]);
    } finally {
      setLoading(false);
    }
  }

  function formatData(data, action) {
    if (!data || data.length === 0) return 'No data found.\n';

    switch (action) {
      case 'list_assets':
        return data.map(d => `  ${d.symbol} | ${d.name} | ${d.instrumentClass} | ${d.exchange}`).join('\n') + '\n';
      case 'list_data_sources':
        return data.map(d => `  ${d.vendorName} | ${d.licenseType} | Last synced: ${d.lastSyncedAt ? new Date(d.lastSyncedAt).toLocaleDateString() : 'Never'}`).join('\n') + '\n';
      case 'fetch_time_series':
        return data.map(d => `  ${new Date(d.date).toLocaleDateString()} | Open: $${parseFloat(d.open)} | Close: $${parseFloat(d.close)} | Vol: ${parseInt(d.volume).toLocaleString()}`).join('\n') + '\n';
      case 'compare_assets':
        return data.map(d => {
          const stats = d.stats;
          return `  ${d.instrument.symbol}: Avg Close: $${stats?.avgClose?.toFixed(2) || 'N/A'} | Range: $${stats?.minLow?.toFixed(2) || 'N/A'} - $${stats?.maxHigh?.toFixed(2) || 'N/A'}`;
        }).join('\n') + '\n';
      default:
        return JSON.stringify(data, null, 2) + '\n';
    }
  }

  function formatObject(data, action) {
    if (action === 'summarize_trends') {
      if (data.message) return data.message + '\n';
      return [
        `  Data Points: ${data.count}`,
        `  Avg Close: $${data.avgClose?.toFixed(2)}`,
        `  Min Low: $${data.minLow?.toFixed(2)}`,
        `  Max High: $${data.maxHigh?.toFixed(2)}`,
        `  Avg Volume: ${Math.round(data.avgVolume)?.toLocaleString()}`,
        `  Period: ${new Date(data.firstDate).toLocaleDateString()} - ${new Date(data.lastDate).toLocaleDateString()}`
      ].join('\n') + '\n';
    }
    if (action === 'forecast_price') {
      if (data.message) return data.message + '\n';
      return [
        `  Method: ${data.method}`,
        `  Forecasted Close: $${data.forecastedClose}`,
        `  Based on recent closes: ${data.basedOn?.map(c => `$${c}`).join(', ')}`
      ].join('\n') + '\n';
    }
    if (action === 'help') {
      return data.map(t => `  ${t.name}: ${t.description}`).join('\n') + '\n';
    }
    return JSON.stringify(data, null, 2) + '\n';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="page assistant-page">
      <h1>AI Assistant</h1>
      <p className="page-description">
        Ask questions about financial data in natural language.
        The assistant uses MCP-style tool calling to query the platform.
      </p>

      <div className="chat-container">
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role}`}>
              <div className="message-header">{msg.role === 'user' ? 'You' : 'Assistant'}</div>
              <div className="message-content">
                <pre>{msg.content}</pre>
              </div>
            </div>
          ))}
          {loading && (
            <div className="chat-message assistant">
              <div className="message-header">Assistant</div>
              <div className="message-content typing">Thinking...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about financial data..."
            rows={2}
            className="chat-input"
          />
          <button onClick={handleSend} className="btn btn-primary" disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
