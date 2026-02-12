import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeftRight, Copy, Check, Terminal, RefreshCw } from 'lucide-react';
import './index.css';

function App() {
    const [sourceText, setSourceText] = useState('');
    const [targetText, setTargetText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [models, setModels] = useState([]);
    const [selectedModel, setSelectedModel] = useState('gemma3:4b');
    const [status, setStatus] = useState('Ready');
    const [statusType, setStatusType] = useState('ready');
    const [copied, setCopied] = useState(false);
    const [sourceLang, setSourceLang] = useState('French');
    const [targetLang, setTargetLang] = useState('English');
    const [updateInfo, setUpdateInfo] = useState(null);
    const [appVersion, setAppVersion] = useState('');

    const fetchModels = useCallback(async () => {
        if (!window.electronAPI) {
            setStatus('No Electron API');
            setStatusType('error');
            return;
        }
        try {
            const data = await window.electronAPI.getModels();
            if (data && data.models && data.models.length > 0) {
                const modelNames = data.models.map(m => m.name);
                setModels(modelNames);
                setSelectedModel(prev => {
                    if (!modelNames.includes(prev) && modelNames.length > 0) {
                        return modelNames[0];
                    }
                    return prev;
                });
                setStatus('Ready');
                setStatusType('ready');
            } else {
                const errorMsg = data?.error || 'No models found';
                setStatus(errorMsg);
                setStatusType('error');
                setModels([]);
            }
        } catch (error) {
            setStatus('Connection Error: ' + error.message);
            setStatusType('error');
        }
    }, []);

    const translateAbortRef = useRef(null);
    const skipDebounceRef = useRef(false);

    const handleTranslate = useCallback(async (textToTranslate, fromLang, toLang) => {
        if (!textToTranslate || !textToTranslate.trim()) return;

        // Cancel any in-progress translation
        if (translateAbortRef.current) {
            translateAbortRef.current.abort();
        }
        const abortController = new AbortController();
        translateAbortRef.current = abortController;

        setIsLoading(true);
        setStatus('Translating...');
        setStatusType('busy');
        setTargetText('');

        // Use provided languages or fall back to current state
        const from = fromLang || sourceLang;
        const to = toLang || targetLang;

        try {
            const response = await window.electronAPI.translate({
                model: selectedModel,
                prompt: `Translate the following text from ${from} to ${to}. Output ONLY the translation, nothing else. No explanation, no quotes, no extra text.\n\nText: ${textToTranslate}`
            });

            // Check if this translation was cancelled
            if (abortController.signal.aborted) return;

            if (response && response.response) {
                setTargetText(response.response.trim());
                setStatus('Done');
                setStatusType('ready');
            } else {
                throw new Error('Invalid response');
            }
        } catch (error) {
            if (abortController.signal.aborted) return;
            console.error('Translation error:', error);
            setStatus('Translation failed');
            setStatusType('error');
        } finally {
            if (!abortController.signal.aborted) setIsLoading(false);
        }
    }, [selectedModel, sourceLang, targetLang]);

    useEffect(() => {
        fetchModels();

        if (window.electronAPI) {
            window.electronAPI.onTriggerTranslate((text) => {
                // Skip the debounce for this text change — we translate immediately
                skipDebounceRef.current = true;
                setSourceText(text);
                handleTranslate(text);
            });
            window.electronAPI.onUpdateAvailable((info) => {
                setUpdateInfo(info);
            });
            window.electronAPI.getVersion().then(ver => {
                setAppVersion(ver);
            });
        }
    }, [fetchModels, handleTranslate]);

    // Auto-translate on text change (debounced)
    const debounceRef = useRef(null);
    useEffect(() => {
        // If this change came from trigger-translate, skip the debounce
        if (skipDebounceRef.current) {
            skipDebounceRef.current = false;
            return;
        }
        if (!sourceText.trim()) {
            setTargetText('');
            return;
        }
        // Clear previous timer
        if (debounceRef.current) clearTimeout(debounceRef.current);
        // Set new timer — translate after 500ms of no typing
        debounceRef.current = setTimeout(() => {
            handleTranslate(sourceText);
        }, 500);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [sourceText]); // Only re-run when sourceText changes

    const swapLanguages = () => {
        const newSourceLang = targetLang;
        const newTargetLang = sourceLang;
        setSourceLang(newSourceLang);
        setTargetLang(newTargetLang);
        // Swap texts and re-translate
        if (targetText) {
            const newSource = targetText;
            setSourceText(newSource);
            setTargetText('');
            // Translate the swapped text with swapped languages
            handleTranslate(newSource, newSourceLang, newTargetLang);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(targetText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="app-container">
            {/* Header */}
            <div className="title-bar">
                <div className="app-title">
                    <Terminal size={14} />
                    <span>DeepLocal Mac</span>
                </div>
                <div className="model-selector" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="model-select"
                    >
                        {models.length > 0 ? (
                            models.map(model => (
                                <option key={model} value={model}>{model}</option>
                            ))
                        ) : (
                            <option value="" disabled>{status === 'Ready' ? 'No models found' : status}</option>
                        )}
                    </select>
                    <button
                        onClick={fetchModels}
                        className="panel-action-btn"
                        title="Refresh Models"
                        style={{ padding: '4px' }}
                    >
                        <RefreshCw size={14} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="main-content">
                {/* Source Panel */}
                <div className="panel">
                    <div className="panel-header">
                        <span className="lang-label">{sourceLang}</span>
                        {sourceText && (
                            <button onClick={() => { setSourceText(''); setTargetText(''); }} className="panel-action-btn" title="Clear">
                                ✕
                            </button>
                        )}
                    </div>
                    <textarea
                        className="translate-input"
                        placeholder="Type or paste to translate..."
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                handleTranslate(sourceText);
                            }
                        }}
                    />
                </div>

                {/* Swap */}
                <div className="swap-container">
                    <button
                        className="swap-btn"
                        title="Swap languages"
                        onClick={swapLanguages}
                    >
                        <ArrowLeftRight size={16} />
                    </button>
                </div>

                {/* Target Panel */}
                <div className="panel">
                    <div className="panel-header">
                        <span className="lang-label">{targetLang}</span>
                        <button
                            onClick={copyToClipboard}
                            className={`panel-action-btn ${copied ? 'success' : ''}`}
                            title="Copy translation"
                        >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                    </div>
                    <div className="translate-output">
                        {isLoading ? (
                            <div className="loading-pulse">Translating...</div>
                        ) : (
                            targetText || <span style={{ opacity: 0.3 }}>Translation will appear here...</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="status-bar">
                <div className="status-indicator">
                    <div className={`status-dot ${statusType}`}></div>
                    <span>{status}</span>
                </div>
                {updateInfo && (
                    <a
                        href={updateInfo.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#4cc9f0', marginLeft: '15px', fontSize: '11px', textDecoration: 'none', cursor: 'pointer' }}
                        onClick={(e) => {
                            e.preventDefault();
                            if (window.electronAPI && window.electronAPI.shell) {
                                // We don't have shell exposed in preload, let's open via window.open which Main handles
                                window.open(updateInfo.url, '_blank');
                            } else {
                                window.open(updateInfo.url, '_blank');
                            }
                        }}
                    >
                        New version available ({updateInfo.version}) - Click here to download
                    </a>
                )}

                {appVersion && (
                    <span style={{ color: '#555', fontSize: '11px', margin: '0 8px', opacity: 0.7 }}>v{appVersion}</span>
                )}
                <div className="shortcuts">
                    <span><span className="kbd">⌘</span>+<span className="kbd">↵</span> Translate</span>
                    <span><span className="kbd">⌘</span>+<span className="kbd">C</span>+<span className="kbd">C</span> Quick Translate</span>
                </div>
            </div>
        </div >
    )
}

export default App
