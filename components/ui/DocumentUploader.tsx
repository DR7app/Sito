import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from '../../hooks/useTranslation';

interface DocumentUploaderProps {
  onFileChange: (file: File | null) => void;
  title: string;
  details: string[];
}

const DocumentUploader: React.FC<DocumentUploaderProps> = ({ onFileChange, title, details }) => {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      const selectedFile = acceptedFiles[0];
      setFile(selectedFile);
      onFileChange(selectedFile);

      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setPreview(null); // No preview for non-image files like PDF
      }
    }
  }, [onFileChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.png'], 'application/pdf': ['.pdf'] },
    maxSize: 5 * 1024 * 1024, // 5MB
  });

  const handleRemove = () => {
    setFile(null);
    setPreview(null);
    onFileChange(null);
  };

  return (
    <div className="space-y-2">
      <label className="text-base font-semibold text-white">{title}</label>
      {file ? (
        <div className="p-2 bg-gray-800 rounded-lg flex items-center space-x-3">
          {preview && (
            <img src={preview} alt="Preview" className="h-12 w-12 object-cover rounded" />
          )}
          <div className="flex-grow text-sm text-gray-300">
            <p className="truncate">{file.name}</p>
            <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
          </div>
          <button type="button" onClick={handleRemove} className="p-1 text-gray-400 hover:text-white">
            Remove
          </button>
        </div>
      ) : (
        <div {...getRootProps()} className={`p-4 border-2 border-dashed rounded-lg text-center cursor-pointer ${isDragActive ? 'border-white bg-gray-700' : 'border-gray-600 hover:border-gray-500'}`}>
          <input {...getInputProps()} />
          <p className="text-sm text-gray-300"> {t({ it: "trascina qui o clicca per caricare", en: "drag here or click to upload" })}</p>
          <ul className="text-xs text-gray-400 mt-2 list-disc list-inside">
            {details.map((detail, i) => <li key={i}>{detail}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DocumentUploader;