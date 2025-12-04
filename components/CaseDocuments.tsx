
import * as React from 'react';
import { useData } from '../context/DataContext';
import { CaseDocument } from '../types';
import { DocumentArrowUpIcon, TrashIcon, EyeIcon, DocumentTextIcon, PhotoIcon, XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon, CameraIcon, CloudArrowUpIcon, CloudArrowDownIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowDownTrayIcon, PlusIcon, MagnifyingGlassPlusIcon, MagnifyingGlassMinusIcon, ArrowPathRoundedSquareIcon, CloudIcon } from './icons';
import { renderAsync } from 'docx-preview';

interface CaseDocumentsProps {
    caseId: string;
}

const SyncStatusIcon: React.FC<{ state: CaseDocument['localState'] }> = ({ state }) => {
    switch (state) {
        case 'synced':
            return <CheckCircleIcon className="w-5 h-5 text-green-500" title="محفوظ محلياً (آمن)" />;
        case 'pending_upload':
            return <CloudArrowUpIcon className="w-5 h-5 text-blue-500 animate-pulse" title="بانتظار الرفع والمزامنة" />;
        case 'pending_download':
            return <CloudArrowDownIcon className="w-5 h-5 text-gray-400" title="جاهز للتنزيل" />;
        case 'cloud_only':
            return <CloudIcon className="w-5 h-5 text-gray-400" title="متوفر في السحابة (انقر للتنزيل)" />;
        case 'downloading':
            return <CloudArrowDownIcon className="w-5 h-5 text-blue-500 animate-spin" title="جاري التنزيل..." />;
        case 'error':
            return <ExclamationCircleIcon className="w-5 h-5 text-red-500" title="فشل المزامنة" />;
        default:
            return null;
    }
};

const FilePreview: React.FC<{ doc: CaseDocument, onPreview: (doc: CaseDocument) => void, onDelete: (doc: CaseDocument) => void }> = ({ doc, onPreview, onDelete }) => {
    const [thumbnailUrl, setThumbnailUrl] = React.useState<string | null>(null);
    const [isLoadingThumbnail, setIsLoadingThumbnail] = React.useState(false);
    const { getDocumentFile } = useData();

    React.useEffect(() => {
        let objectUrl: string | null = null;
        let isMounted = true;
        const generateThumbnail = async () => {
            // Don't generate thumbnails for non-images or files not yet downloaded
            if (doc.localState === 'pending_download' || doc.localState === 'cloud_only' || !doc.type.startsWith('image/')) {
                 setIsLoadingThumbnail(false);
                 return;
            }

            setIsLoadingThumbnail(true);
            const file = await getDocumentFile(doc.id);
            if (!file || !isMounted) {
                setIsLoadingThumbnail(false);
                return;
            }

            if (doc.type.startsWith('image/')) {
                objectUrl = URL.createObjectURL(file);
                setThumbnailUrl(objectUrl);
            }
            setIsLoadingThumbnail(false);
        };

        generateThumbnail();

        return () => {
            isMounted = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [doc.id, doc.type, doc.localState, getDocumentFile]);
    
    return (
        <div className="relative group border rounded-lg overflow-hidden bg-gray-50 flex flex-col aspect-w-1 aspect-h-1">
            <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); onDelete(doc); }} className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-md" title="حذف من جهازي فقط">
                    <TrashIcon className="w-4 h-4" />
                </button>
            </div>
             <div className="absolute top-2 left-2 z-10">
                <SyncStatusIcon state={doc.localState} />
            </div>
            <div 
                className="flex-grow flex items-center justify-center cursor-pointer overflow-hidden"
                onClick={() => onPreview(doc)}
            >
                {isLoadingThumbnail ? (
                     <div className="flex-grow flex items-center justify-center bg-gray-200 w-full h-full">
                        <ArrowPathIcon className="w-8 h-8 text-gray-400 animate-spin"/>
                    </div>
                ) : thumbnailUrl ? (
                    <img src={thumbnailUrl} alt={doc.name} className="object-cover w-full h-full" />
                ) : (
                    <div className="flex-grow flex items-center justify-center bg-gray-200 w-full h-full">
                        {doc.localState === 'cloud_only' ? <CloudIcon className="w-12 h-12 text-gray-400" /> : <DocumentTextIcon className="w-12 h-12 text-gray-400" />}
                    </div>
                )}
            </div>
            <div className="p-2 bg-white/80 backdrop-blur-sm border-t">
                <p className="text-xs font-medium text-gray-800 truncate" title={doc.name}>{doc.name}</p>
                <p className="text-xs text-gray-500">{(doc.size / 1024).toFixed(1)} KB</p>
            </div>
        </div>
    );
};

// ... TextPreview, DocxPreview, ImageViewer, PreviewModal, DocumentScannerModal components remain unchanged ...
// Assuming they are correctly defined in your file as provided in the context. 
// I will include them to ensure file completeness.

const TextPreview: React.FC<{ file: File; name: string }> = ({ file, name }) => {
    const [content, setContent] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    React.useEffect(() => {
        const reader = new FileReader();
        reader.onload = (e) => setContent(e.target?.result as string);
        reader.onerror = () => setError('خطأ في قراءة الملف.');
        reader.readAsText(file);
    }, [file]);

    return (
        <div className="w-full h-full bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col">
            <h3 className="text-lg font-semibold border-b border-gray-300 pb-2 mb-4 text-gray-800 flex-shrink-0">{name}</h3>
            <div className="flex-grow bg-white p-6 rounded shadow-inner overflow-auto">
                {content === null && !error && <div className="text-center p-8 text-gray-600">جاري تحميل المحتوى...</div>}
                {error && <div className="text-center p-8 text-red-600">{error}</div>}
                {content && <pre className="text-sm whitespace-pre-wrap text-gray-800">{content}</pre>}
            </div>
        </div>
    );
};

const DocxPreview: React.FC<{ file: File; name: string; onClose: () => void; onDownload: () => void }> = ({ file, name, onClose, onDownload }) => {
    const previewerRef = React.useRef<HTMLDivElement>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const isOldDocFormat = name.toLowerCase().endsWith('.doc');

    React.useEffect(() => {
        if (isOldDocFormat || !previewerRef.current) {
            setIsLoading(false);
            return;
        }

        renderAsync(file, previewerRef.current)
            .then(() => {
                setIsLoading(false);
            })
            .catch(e => {
                console.error('Docx-preview error:', e);
                setError('حدث خطأ أثناء عرض المستند. قد يكون الملف تالفًا أو غير مدعوم. جرب تنزيل الملف بدلاً من ذلك.');
                setIsLoading(false);
            });
    }, [file, isOldDocFormat]);

    return (
        <div className="w-full h-full bg-gray-100 p-4 rounded-lg overflow-auto flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-300 pb-2 mb-4 flex-shrink-0">
                <h3 className="text-lg font-semibold text-gray-800">{name}</h3>
                <div className="flex items-center gap-4">
                    <button onClick={onDownload} className="flex items-center gap-2 text-sm px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                        <ArrowDownTrayIcon className="w-4 h-4" />
                        <span>تنزيل الملف</span>
                    </button>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
            <div className="flex-grow bg-white p-2 rounded shadow-inner overflow-auto relative">
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                        <ArrowPathIcon className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                )}
                {isOldDocFormat ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                        <ExclamationTriangleIcon className="w-12 h-12 text-yellow-500 mb-4" />
                        <h4 className="text-lg font-bold text-gray-800">تنسيق ملف غير مدعوم للمعاينة</h4>
                        <p className="text-gray-600 mt-2">
                            لا يمكن عرض ملفات Word القديمة (ذات امتداد .doc) مباشرة في المتصفح. يرجى استخدام زر التنزيل لفتح الملف باستخدام Microsoft Word.
                        </p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-8">
                         <ExclamationCircleIcon className="w-12 h-12 text-red-500 mb-4" />
                         <h4 className="text-lg font-bold text-red-800">فشل عرض الملف</h4>
                         <p className="text-gray-600 mt-2">{error}</p>
                    </div>
                ) : (
                    <div ref={previewerRef} />
                )}
            </div>
        </div>
    );
};

const ImageViewer: React.FC<{ src: string; alt: string; onClose: () => void }> = ({ src, alt, onClose }) => {
    const [scale, setScale] = React.useState(1);
    const [position, setPosition] = React.useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = React.useState(false);
    const imgRef = React.useRef<HTMLImageElement>(null);
    const lastPos = React.useRef<{ x: number, y: number } | null>(null);
    const lastDist = React.useRef<number | null>(null);

    React.useEffect(() => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    }, [src]);

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const delta = e.deltaY * -0.002;
        const newScale = Math.min(Math.max(1, scale + delta), 5);
        setScale(newScale);
        if (newScale === 1) setPosition({ x: 0, y: 0 });
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        imgRef.current?.setPointerCapture(e.pointerId);
        setIsDragging(true);
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isDragging || !lastPos.current) return;
        const deltaX = e.clientX - lastPos.current.x;
        const deltaY = e.clientY - lastPos.current.y;
        if (scale > 1) {
            setPosition(prev => ({ x: prev.x + deltaX, y: prev.y + deltaY }));
        }
        lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        lastPos.current = null;
        lastDist.current = null;
        imgRef.current?.releasePointerCapture(e.pointerId);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
            if (lastDist.current) {
                const delta = dist - lastDist.current;
                const zoomFactor = delta * 0.01;
                setScale(prev => Math.min(Math.max(1, prev + zoomFactor), 5));
            }
            lastDist.current = dist;
        }
    };

    const handleTouchEnd = () => { lastDist.current = null; };
    const resetZoom = () => { setScale(1); setPosition({ x: 0, y: 0 }); };
    const zoomIn = () => setScale(s => Math.min(s + 0.5, 5));
    const zoomOut = () => { const newScale = Math.max(1, scale - 0.5); setScale(newScale); if (newScale === 1) setPosition({ x: 0, y: 0 }); };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col justify-center items-center overflow-hidden touch-none" onWheel={handleWheel}>
            <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-50 bg-gradient-to-b from-black/60 to-transparent">
                <span className="text-white font-medium truncate max-w-[70%]">{alt}</span>
                <button onClick={onClose} className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors backdrop-blur-md"><XMarkIcon className="w-6 h-6" /></button>
            </div>
            <div className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
                <img ref={imgRef} src={src} alt={alt} className="max-w-none max-h-none transition-transform duration-75 ease-linear select-none touch-none" style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} draggable={false} />
            </div>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 px-6 py-3 bg-white/10 backdrop-blur-md rounded-full border border-white/20 shadow-2xl z-50">
                <button onClick={zoomOut} className="text-white hover:text-blue-300 disabled:opacity-50" disabled={scale <= 1}><div className="p-1"><MagnifyingGlassMinusIcon className="w-6 h-6" /></div></button>
                <span className="text-white font-mono text-sm min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
                <button onClick={zoomIn} className="text-white hover:text-blue-300 disabled:opacity-50" disabled={scale >= 5}><div className="p-1"><MagnifyingGlassPlusIcon className="w-6 h-6" /></div></button>
                <div className="w-px h-6 bg-white/20 mx-1"></div>
                <button onClick={resetZoom} className="text-white hover:text-blue-300" title="إعادة الضبط"><div className="p-1"><ArrowPathRoundedSquareIcon className="w-5 h-5" /></div></button>
            </div>
        </div>
    );
};

const PreviewModal: React.FC<{ doc: CaseDocument; onClose: () => void }> = ({ doc, onClose }) => {
    const { getDocumentFile, documents } = useData();
    const [file, setFile] = React.useState<File | null>(null);
    const [objectUrl, setObjectUrl] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const currentDoc = documents.find(d => d.id === doc.id) || doc;

    React.useEffect(() => {
        let url: string | null = null;
        const loadFile = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const retrievedFile = await getDocumentFile(doc.id);
                if (retrievedFile) {
                    setFile(retrievedFile);
                    url = URL.createObjectURL(retrievedFile);
                    setObjectUrl(url);
                } else {
                    const latestDocState = documents.find(d => d.id === doc.id)?.localState;
                    if (latestDocState === 'error') {
                        setError('فشل تنزيل الملف. يرجى التحقق من اتصالك بالإنترنت.');
                    } else if (latestDocState === 'cloud_only') {
                        // This case should be handled by auto-triggering download in useSupabaseData/useEffect,
                        // but if we are here, it means we are waiting.
                        // We rely on getDocumentFile to trigger the download state change.
                    } else {
                        setError('الملف غير متوفر محلياً بعد.');
                    }
                }
            } catch (e: any) { setError('حدث خطأ غير متوقع: ' + e.message); } finally { setIsLoading(false); }
        };
        loadFile();
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [doc.id, getDocumentFile, documents]);

    const handleDownload = () => {
        if (objectUrl) {
            const a = document.createElement('a'); a.href = objectUrl; a.download = doc.name;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
    };

    const renderPreview = () => {
        if (!file || !objectUrl) return null;
        if (currentDoc.localState === 'downloading') return (<div className="flex flex-col items-center justify-center h-full"><CloudArrowDownIcon className="w-12 h-12 text-blue-500 animate-spin mb-4" /><p className="text-gray-700">جاري تنزيل الملف...</p></div>);
        if (file.type.startsWith('image/')) return <ImageViewer src={objectUrl} alt={doc.name} onClose={onClose} />;
        if (file.type.startsWith('text/')) return <TextPreview file={file} name={doc.name} />;
        if (doc.name.toLowerCase().endsWith('.docx') || doc.name.toLowerCase().endsWith('.doc')) return <DocxPreview file={file} name={doc.name} onClose={onClose} onDownload={handleDownload} />;
        return (
            <div className="text-center p-8 flex flex-col items-center justify-center h-full">
                <DocumentTextIcon className="w-16 h-16 text-gray-400 mb-4" />
                <h3 className="font-bold text-lg">لا توجد معاينة متاحة</h3>
                <p className="text-gray-600">تنسيق الملف ({doc.type}) غير مدعوم للمعاينة المباشرة.</p>
                <button onClick={handleDownload} className="mt-6 flex items-center mx-auto gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><ArrowDownTrayIcon className="w-5 h-5" /><span>تنزيل الملف ({ (file.size / (1024 * 1024)).toFixed(2) } MB)</span></button>
            </div>
        );
    };

    if (file && file.type.startsWith('image/')) return renderPreview();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {isLoading && <div className="flex items-center justify-center h-full"><ArrowPathIcon className="w-8 h-8 animate-spin text-blue-500" /></div>}
                {error && <div className="flex flex-col items-center justify-center h-full p-4"><ExclamationTriangleIcon className="w-10 h-10 text-red-500 mb-4"/><p className="text-red-700 text-center">{error}</p></div>}
                {!isLoading && !error && renderPreview()}
            </div>
        </div>
    );
};

const DocumentScannerModal: React.FC<{ onClose: () => void; onCapture: (file: File) => void }> = ({ onClose, onCapture }) => {
    const videoRef = React.useRef<HTMLVideoElement>(null);
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const streamRef = React.useRef<MediaStream | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isPreview, setIsPreview] = React.useState(false);

    React.useEffect(() => {
        const startCamera = async () => {
            setIsLoading(true);
            try {
                const constraints = { video: { facingMode: 'environment', width: { ideal: 4096 }, height: { ideal: 2160 } } };
                streamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
                if (videoRef.current) videoRef.current.srcObject = streamRef.current;
            } catch (err) {
                try {
                    streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                    if (videoRef.current) videoRef.current.srcObject = streamRef.current;
                } catch (fallbackErr) { setError('لم يتمكن من الوصول إلى الكاميرا.'); }
            } finally { setIsLoading(false); }
        };
        startCamera();
        return () => { streamRef.current?.getTracks().forEach(track => track.stop()); };
    }, []);

    const handleCapture = () => {
        if (videoRef.current && canvasRef.current && !isLoading) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            if (!context) return;
            context.filter = 'grayscale(1) contrast(1.5) brightness(1.15)';
            context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
            setIsPreview(true);
        }
    };
    
    const handleSave = () => {
        if (canvasRef.current) {
            canvasRef.current.toBlob(blob => {
                if (blob) {
                    const fileName = `document-${new Date().toISOString()}.jpeg`;
                    const file = new File([blob], fileName, { type: 'image/jpeg' });
                    onCapture(file);
                }
            }, 'image/jpeg', 0.92);
        }
    };

    const handleRetake = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (canvas && context) {
            context.filter = 'none';
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
        setIsPreview(false);
    };

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center" onClick={onClose}>
            <div className="relative w-full h-full" onClick={e => e.stopPropagation()}>
                <video ref={videoRef} autoPlay playsInline className={`w-full h-full object-cover ${isPreview ? 'hidden' : ''}`}></video>
                <canvas ref={canvasRef} className={`w-full h-full object-contain ${isPreview ? '' : 'hidden'}`}></canvas>
                {!isPreview && ( <div className="absolute inset-0 pointer-events-none border-[1rem] sm:border-[2rem] border-black/50"></div> )}
                {(isLoading || error) && <div className="absolute inset-0 flex items-center justify-center bg-black/70">{isLoading && <ArrowPathIcon className="w-12 h-12 text-white animate-spin" />}{error && <p className="text-white text-center p-8 max-w-sm">{error}</p>}</div>}
                <button onClick={onClose} className="absolute top-4 right-4 p-3 bg-black/50 rounded-full text-white hover:bg-black/75 transition-colors z-10"><XMarkIcon className="w-6 h-6" /></button>
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center items-center">
                    {isPreview ? (
                        <div className="flex items-center justify-around w-full max-w-xs">
                             <button onClick={handleRetake} className="flex flex-col items-center text-white font-semibold p-2 rounded-lg hover:bg-white/10"><ArrowPathIcon className="w-8 h-8 mb-1"/><span>إعادة</span></button>
                             <button onClick={handleSave} className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center p-1 ring-4 ring-black/30 hover:bg-blue-600"><CheckCircleIcon className="w-12 h-12 text-white"/></button>
                        </div>
                    ) : ( <button onClick={handleCapture} disabled={isLoading} className="w-20 h-20 rounded-full bg-white flex items-center justify-center p-1 ring-4 ring-black/30 disabled:opacity-50"><div className="w-full h-full rounded-full bg-white border-2 border-black"></div></button> )}
                </div>
            </div>
        </div>
    );
};

const CaseDocuments: React.FC<CaseDocumentsProps> = ({ caseId }) => {
    const { documents, addDocuments, deleteDocument, getDocumentFile } = useData();
    const [isDeleteModalOpen, setIsDeleteModalOpen] = React.useState(false);
    const [docToDelete, setDocToDelete] = React.useState<CaseDocument | null>(null);
    const [previewDoc, setPreviewDoc] = React.useState<CaseDocument | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [isCameraOpen, setIsCameraOpen] = React.useState(false);

    const caseDocuments = React.useMemo(() => 
        documents.filter(doc => doc.caseId === caseId).sort((a,b) => b.addedAt.getTime() - a.addedAt.getTime()), 
        [documents, caseId]
    );

    const handleFileChange = async (files: FileList | null) => {
        if (files && files.length > 0) {
            try { await addDocuments(caseId, files); } catch (err: any) { alert(`فشل في إضافة الوثائق: ${err.message}`); }
        }
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
        else if (e.type === 'dragleave') setIsDragging(false);
    };
    
    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) await handleFileChange(e.dataTransfer.files);
    };

    const openDeleteModal = (doc: CaseDocument) => {
        setDocToDelete(doc);
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (docToDelete) {
            try { await deleteDocument(docToDelete); } catch (err: any) { alert(`فشل في حذف الوثيقة: ${err.message}`); }
        }
        setIsDeleteModalOpen(false);
        setDocToDelete(null);
    };

    const handlePhotoCapture = async (file: File) => {
        const fileList = new DataTransfer(); fileList.items.add(file);
        try { await addDocuments(caseId, fileList.files); } catch (err: any) { alert(`فشل في إضافة الوثيقة الملتقطة: ${err.message}`); }
        setIsCameraOpen(false);
    };
    
    const handlePreview = async (doc: CaseDocument) => {
        if (doc.type === 'application/pdf') {
            const file = await getDocumentFile(doc.id);
            if (file) {
                const url = URL.createObjectURL(file);
                window.open(url, '_blank');
            }
        } else { setPreviewDoc(doc); }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
                 <input type="file" id={`file-upload-${caseId}`} multiple className="hidden" onChange={(e) => handleFileChange(e.target.files)} />
                 <div onDragEnter={handleDragEvents} onDragLeave={handleDragEvents} onDragOver={handleDragEvents} onDrop={handleDrop} className="flex-grow">
                    <label htmlFor={`file-upload-${caseId}`} className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-100 transition-colors h-full ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'}`}>
                        <DocumentArrowUpIcon className="w-10 h-10 text-gray-400 mb-2" />
                        <span className="font-semibold text-gray-700">اسحب وأفلت الملفات هنا، أو اضغط للاختيار</span>
                        <p className="text-xs text-gray-500">يتم رفع الملفات ومزامنتها تلقائياً مع كافة مستخدمي الحساب.</p>
                    </label>
                </div>
                <button onClick={() => setIsCameraOpen(true)} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <CameraIcon className="w-10 h-10 text-gray-400 mb-2" />
                    <span className="font-semibold text-gray-700">التقاط وثيقة</span>
                    <p className="text-xs text-gray-500">استخدم كاميرا جهازك</p>
                </button>
            </div>
            
            {caseDocuments.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {caseDocuments.map(doc => (
                        <FilePreview key={doc.id} doc={doc} onPreview={handlePreview} onDelete={openDeleteModal} />
                    ))}
                </div>
            ) : ( <div className="text-center py-8 text-gray-500"><p>لا توجد وثائق لهذه القضية بعد.</p></div> )}

            {isDeleteModalOpen && docToDelete && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsDeleteModalOpen(false)}>
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="text-center">
                            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4"><ExclamationTriangleIcon className="h-8 w-8 text-red-600" /></div>
                            <h3 className="text-2xl font-bold">تأكيد حذف الوثيقة</h3>
                            <p className="my-4">هل أنت متأكد من حذف وثيقة "{docToDelete.name}"؟</p>
                            <p className="text-sm text-gray-500 bg-gray-100 p-2 rounded">ملاحظة: سيتم حذف الملف من جهازك الحالي فقط (لتحرير المساحة) ويبقى محفوظاً في السحابة (cloud_only). يمكنك إعادة تنزيله في أي وقت.</p>
                        </div>
                        <div className="mt-6 flex justify-center gap-4">
                            <button className="px-6 py-2 bg-gray-200 rounded-lg" onClick={() => setIsDeleteModalOpen(false)}>إلغاء</button>
                            <button className="px-6 py-2 bg-red-600 text-white rounded-lg" onClick={confirmDelete}>نعم، حذف محلياً</button>
                        </div>
                    </div>
                </div>
            )}
            
            {previewDoc && <PreviewModal doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
            {isCameraOpen && <DocumentScannerModal onClose={() => setIsCameraOpen(false)} onCapture={handlePhotoCapture} />}
        </div>
    );
};

export default CaseDocuments;