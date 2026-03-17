import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";

interface YAMLTABProps {
  yamlStr: string;
  theme: string;
}

export const YAMLTAB: React.FC<YAMLTABProps> = ({ yamlStr, theme }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!yamlStr) return;
    navigator.clipboard.writeText(yamlStr).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      (err) => {
        console.error("Failed to copy yaml: ", err);
      },
    );
  };

  return (
    <div className="relative mt-4">
      <div className="absolute top-2 right-2 z-10">
        <button
          onClick={handleCopy}
          className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${
            theme === "dark"
              ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
              : "bg-gray-200 hover:bg-gray-300 text-gray-600"
          }`}
          title="复制 YAML"
        >
          {copied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
        </button>
      </div>
      <div
        className={`rounded-lg overflow-hidden border ${
          theme === "dark" ? "border-gray-700 max-h-[600px] overflow-auto" : "border-gray-200 max-h-[600px] overflow-auto"
        }`}
      >
        <SyntaxHighlighter
          language="yaml"
          style={theme === "dark" ? vscDarkPlus : vs}
          customStyle={{
            margin: 0,
            padding: "1rem",
            fontSize: "0.875rem",
            background: "transparent",
          }}
          showLineNumbers={true}
        >
          {yamlStr || "# 暂无 YAML 数据"}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};
