
import * as React from 'react';
import { GoogleGenAI } from "@google/genai";
import { useData } from '../context/DataContext';
// Fix: Removed non-existent PaperAirplaneIcon and unused ArrowPathIcon to resolve import error.
import { SparklesIcon, XMarkIcon } from './icons';

const LegalAI: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const { clients, adminTasks, allSessions, activeProfile } = useData();
    const [messages, setMessages] = React.useState<{ role: 'user' | 'model'; text: string }[]>([]);
    const [input, setInput] = React.useState('');
    const [isLoading, setIsLoading] = React.useState(false);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // Auto-scroll chat
    React.useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const generateSystemPrompt = () => {
        const today = new Date().toLocaleDateString('ar-SY');
        const sessionCount = allSessions.filter(s => !s.isPostponed).length;
        const taskCount = adminTasks.filter(t => !t.completed).length;
        
        return `أنت مساعد قانوني ذكي متخصص في القوانين السورية والأنظمة الإدارية، تعمل في "مكتب المحامي" للمحامي ${activeProfile?.full_name || 'المستخدم'}. 
تاريخ اليوم هو ${today}.
لديك وصول للمعلومات التالية من قاعدة بيانات المكتب:
- عدد الجلسات القادمة غير المرحلة: ${sessionCount}
- عدد المهام الإدارية المعلقة: ${taskCount}
- إجمالي عدد الموكلين: ${clients.length}

وظيفتك:
1. الإجابة على استفسارات المحامي حول القضايا أو الإجراءات القانونية.
2. تلخيص جدول الأعمال وتنبيه المحامي للمهام العاجلة.
3. المساعدة في صياغة نصوص قانونية أو مذكرات جوابية بناءً على القواعد القانونية السورية.

تواصل دائماً باللغة العربية الفصحى، كن دقيقاً، مهنياً، وودوداً.`;
    };

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsLoading(true);

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: [
                    { role: 'user', parts: [{ text: userMsg }] }
                ],
                config: {
                    systemInstruction: generateSystemPrompt(),
                }
            });

            const aiText = response.text || "عذراً، لم أستطع توليد رد حالياً.";
            setMessages(prev => [...prev, { role: 'model', text: aiText }]);
        } catch (error: any) {
            console.error("AI Error:", error);
            setMessages(prev => [...prev, { role: 'model', text: `حدث خطأ أثناء الاتصال بالذكاء الاصطناعي: ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-y-0 left-0 w-full sm:w-[400px] bg-white shadow-2xl z-[60] flex flex-col border-r border-gray-200 animate-fade-in no-print">
            <header className="p-4 bg-blue-600 text-white flex justify-between items-center shadow-md">
                <div className="flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6 text-yellow-300 fill-current" />
                    <h2 className="font-bold text-lg">المساعد الذكي</h2>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-blue-700 rounded-full transition-colors">
                    <XMarkIcon className="w-6 h-6" />
                </button>
            </header>

            <div ref={scrollRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.length === 0 && (
                    <div className="text-center py-8">
                        <div className="bg-blue-100 p-4 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                            <SparklesIcon className="w-10 h-10 text-blue-600" />
                        </div>
                        <h3 className="font-bold text-gray-800">كيف يمكنني مساعدتك اليوم؟</h3>
                        <p className="text-sm text-gray-500 mt-2 px-6">أنا هنا لمساعدتك في تلخيص جدولك، صياغة المذكرات، أو الإجابة على استفساراتك القانونية.</p>
                        
                        <div className="grid grid-cols-1 gap-2 mt-6 px-4">
                            <button 
                                onClick={() => { setInput("لخص لي جدول أعمالي لليوم واذكر المهام العاجلة"); }}
                                className="text-right p-3 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-500 transition-colors"
                            >
                                📋 لخص لي جدول أعمالي اليوم
                            </button>
                            <button 
                                onClick={() => { setInput("ساعدني في صياغة مذكرة جوابية لقضية نزاع عقاري"); }}
                                className="text-right p-3 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-500 transition-colors"
                            >
                                ✍️ مساعدة في صياغة مذكرة
                            </button>
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl shadow-sm text-sm whitespace-pre-wrap ${
                            msg.role === 'user' 
                                ? 'bg-blue-600 text-white rounded-tr-none' 
                                : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none'
                        }`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                
                {isLoading && (
                    <div className="flex justify-end">
                        <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-tl-none shadow-sm">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-.5s]"></div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-white border-t border-gray-200">
                <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="اسأل المساعد القانوني..."
                        className="flex-grow p-3 bg-gray-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500 text-sm outline-none"
                    />
                    <button 
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:bg-gray-300 transition-colors shadow-lg"
                    >
                        <svg className="w-5 h-5 transform rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </form>
                <p className="text-[10px] text-gray-400 mt-2 text-center">قد يرتكب الذكاء الاصطناعي أخطاء، يرجى مراجعة المخرجات قانونياً.</p>
            </div>
        </div>
    );
};

export default LegalAI;
