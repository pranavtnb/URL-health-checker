import React, { useState, useEffect } from 'react';
import { Container, Typography, TextField, Button, Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, CircularProgress, Collapse, IconButton, AppBar, Toolbar, Divider, CssBaseline, Chip, Tooltip, Skeleton } from '@mui/material';
import axios from 'axios';
import HistoryIcon from '@mui/icons-material/History';
import LinkIcon from '@mui/icons-material/Link';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, ChartTooltip, Legend);

const API_BASE = 'http://localhost:8000';

function App() {
  const [urls, setUrls] = useState('');
  const [results, setResults] = useState([]);
  const [history, setHistory] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState('');
  const [trendData, setTrendData] = useState([]);
  const [monitorStatus, setMonitorStatus] = useState({ last_run: null, next_run: null, email_alerts: false });
  const [manualCheckLoading, setManualCheckLoading] = useState(false);

  const handleCheck = async () => {
    setLoading(true);
    try {
      const urlList = urls.split('\n').map(u => u.trim()).filter(Boolean);
      if (urlList.length === 0) {
        alert('Please enter at least one valid URL.');
        setLoading(false);
        return;
      }
      const res = await axios.post(`${API_BASE}/check_urls`, { urls: urlList });
      setResults(res.data);
      fetchHistory();
      fetchMetrics();
    } catch (e) {
      let msg = 'Error checking URLs.';
      if (e.response) {
        msg += `\nStatus: ${e.response.status}\n${JSON.stringify(e.response.data)}`;
      } else if (e.request) {
        msg += '\nNo response from backend. Is it running?';
      } else {
        msg += `\n${e.message}`;
      }
      alert(msg);
    }
    setLoading(false);
  };

  const fetchHistory = async () => {
    const res = await axios.get(`${API_BASE}/history?limit=20`);
    setHistory(res.data);
  };

  const fetchMetrics = async () => {
    const res = await axios.get(`${API_BASE}/metrics`);
    setMetrics(res.data);
  };

  const fetchTrendData = async (url) => {
    if (!url) return;
    const res = await axios.get(`${API_BASE}/history_by_url?url=${encodeURIComponent(url)}&limit=30`);
    setTrendData(res.data);
  };

  useEffect(() => {
    fetchHistory();
    fetchMetrics();
  }, []);

  useEffect(() => {
    fetchTrendData(selectedUrl);
  }, [selectedUrl]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await axios.get(`${API_BASE}/schedule/status`);
        setMonitorStatus(res.data);
      } catch (e) {
        setMonitorStatus({ last_run: null, next_run: null, email_alerts: false });
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  const chartData = {
    labels: trendData.map(d => new Date(d.checked_at).toLocaleTimeString()),
    datasets: [
      {
        label: 'Response Time (s)',
        data: trendData.map(d => d.response_time || 0),
        borderColor: 'blue',
        backgroundColor: 'rgba(0,0,255,0.1)',
        yAxisID: 'y',
      },
      {
        label: 'Status (UP=1, DOWN=0)',
        data: trendData.map(d => d.status === 'UP' ? 1 : 0),
        type: 'line',
        borderColor: 'green',
        backgroundColor: 'rgba(0,255,0,0.1)',
        yAxisID: 'y1',
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      y: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: 'Response Time (s)' },
      },
      y1: {
        type: 'linear',
        position: 'right',
        min: 0,
        max: 1,
        title: { display: true, text: 'Status' },
        grid: { drawOnChartArea: false },
        ticks: { stepSize: 1 }
      }
    }
  };

  function StatusBadge({ status }) {
    return (
      <Chip
        label={status}
        color={status === 'UP' ? 'success' : 'error'}
        size="small"
        sx={{ fontWeight: 700, color: 'white' }}
      />
    );
  }

  function LoadingSkeleton({ rows = 5, cols = 4 }) {
    return (
      <>
        {[...Array(rows)].map((_, i) => (
          <TableRow key={i}>
            {[...Array(cols)].map((_, j) => (
              <TableCell key={j}><Skeleton variant="rectangular" height={24} /></TableCell>
            ))}
          </TableRow>
        ))}
      </>
    );
  }

  const triggerManualCheck = async () => {
    setManualCheckLoading(true);
    try {
      await axios.post(`${API_BASE}/schedule/run_now`);
      setTimeout(() => setManualCheckLoading(false), 2000);
    } catch (e) {
      setManualCheckLoading(false);
    }
  };

  return (
    <>
      <CssBaseline />
      <AppBar position="static" color="primary" elevation={4} sx={{ mb: 4 }}>
        <Toolbar>
          <LinkIcon sx={{ mr: 2 }} />
          <Typography variant="h5" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
            URL Health Monitor
          </Typography>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ pb: 4 }}>
        <Paper elevation={3} sx={{ p: 3, mb: 4, background: '#f7f9fa' }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Check API/Website Health</Typography>
          <TextField
            label="Enter URLs (one per line)"
            multiline
            minRows={3}
            fullWidth
            value={urls}
            onChange={e => setUrls(e.target.value)}
            sx={{ mb: 2, background: 'white' }}
          />
          <Button onClick={handleCheck} variant="contained" color="primary" size="large" sx={{ fontWeight: 600 }} disabled={loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Check URLs'}
          </Button>
        </Paper>
        <Divider sx={{ mb: 3 }} />
        {results.length > 0 && (
          <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Latest Check Results</Typography>
            <TableContainer sx={{ mt: 1 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>URL</TableCell>
                    <Tooltip title="UP means reachable, DOWN means error or timeout" arrow><TableCell>Status</TableCell></Tooltip>
                    <Tooltip title="HTTP status code returned by the server" arrow><TableCell>Status Code</TableCell></Tooltip>
                    <Tooltip title="Time taken to get a response (in seconds)" arrow><TableCell>Response Time (s)</TableCell></Tooltip>
                    <Tooltip title="When this check was performed" arrow><TableCell>Checked At</TableCell></Tooltip>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <LoadingSkeleton rows={3} cols={5} />
                  ) : results.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.url}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell>{row.status_code ?? '-'}</TableCell>
                      <TableCell>{row.response_time ? row.response_time.toFixed(2) : '-'}</TableCell>
                      <TableCell>{new Date(row.checked_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
        <Collapse in={showHistory}>
          <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Recent Checks (History)</Typography>
            <TableContainer sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>URL</TableCell>
                    <Tooltip title="UP means reachable, DOWN means error or timeout" arrow><TableCell>Status</TableCell></Tooltip>
                    <Tooltip title="HTTP status code returned by the server" arrow><TableCell>Status Code</TableCell></Tooltip>
                    <Tooltip title="Time taken to get a response (in seconds)" arrow><TableCell>Response Time (s)</TableCell></Tooltip>
                    <Tooltip title="When this check was performed" arrow><TableCell>Checked At</TableCell></Tooltip>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.length === 0 ? (
                    <LoadingSkeleton rows={5} cols={5} />
                  ) : history.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>{row.url}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell>{row.status_code ?? '-'}</TableCell>
                      <TableCell>{row.response_time ? row.response_time.toFixed(2) : '-'}</TableCell>
                      <TableCell>{new Date(row.checked_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Collapse>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, flexGrow: 1 }}>URL Health Metrics</Typography>
          <IconButton onClick={() => setShowHistory(v => !v)} color="primary" size="large">
            <HistoryIcon />
          </IconButton>
          <Typography variant="body2" sx={{ ml: 1 }}>{showHistory ? 'Hide' : 'Show'} History</Typography>
        </Box>
        <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>URL</TableCell>
                  <Tooltip title="Total number of checks performed" arrow><TableCell>Total Checks</TableCell></Tooltip>
                  <Tooltip title="Number of successful checks" arrow><TableCell>UP Count</TableCell></Tooltip>
                  <Tooltip title="Percentage of successful checks" arrow><TableCell>UP %</TableCell></Tooltip>
                  <Tooltip title="Number of failed checks" arrow><TableCell>Error Count</TableCell></Tooltip>
                  <Tooltip title="Percentage of failed checks" arrow><TableCell>Error Rate (%)</TableCell></Tooltip>
                </TableRow>
              </TableHead>
              <TableBody>
                {metrics.length === 0 ? (
                  <LoadingSkeleton rows={5} cols={6} />
                ) : metrics.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Button size="small" onClick={() => setSelectedUrl(row.url)} variant={selectedUrl === row.url ? 'contained' : 'outlined'} sx={{ fontWeight: 600 }}>{row.url}</Button>
                    </TableCell>
                    <TableCell>{row.total_checks}</TableCell>
                    <TableCell>{row.up_count}</TableCell>
                    <TableCell>{row.up_percent}%</TableCell>
                    <TableCell>{row.error_count}</TableCell>
                    <TableCell>{row.error_rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
        <Paper elevation={2} sx={{ p: 2, mb: 3, background: '#e8f5e9' }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Monitoring Status</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', mb: 1 }}>
            <Typography variant="body1" sx={{ mr: 2 }}>
              <b>Last Scheduled Check:</b> {monitorStatus.last_run ? new Date(monitorStatus.last_run).toLocaleString() : 'N/A'}
            </Typography>
            <Typography variant="body1" sx={{ mr: 2 }}>
              <b>Next Scheduled Check:</b> {monitorStatus.next_run ? new Date(monitorStatus.next_run).toLocaleString() : 'N/A'}
            </Typography>
            <Chip label={monitorStatus.email_alerts ? 'Email Alerts ON' : 'Email Alerts OFF'} color={monitorStatus.email_alerts ? 'success' : 'default'} size="small" sx={{ ml: 2 }} />
          </Box>
          <Button variant="outlined" color="primary" size="small" onClick={triggerManualCheck} disabled={manualCheckLoading}>
            {manualCheckLoading ? <CircularProgress size={18} color="inherit" /> : 'Run Check Now'}
          </Button>
        </Paper>
        {selectedUrl && trendData.length > 0 && (
          <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Trend for {selectedUrl}</Typography>
            <Line data={chartData} options={chartOptions} height={120} />
          </Paper>
        )}
        <Divider sx={{ my: 4 }} />
        <Box sx={{ textAlign: 'center', color: 'gray', fontSize: 14, pb: 2 }}>
          &copy; {new Date().getFullYear()} URL Health Monitor &mdash; Powered by FastAPI & React
        </Box>
      </Container>
    </>
  );
}

export default App;
