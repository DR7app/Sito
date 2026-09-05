import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../hooks/useTranslation';

interface Post {
  id: number;
  title: string;
  content: string;
}

const mockPosts: Post[] = [
    { 
      id: 1, 
      title: 'The Art of Driving a Car', 
      content: 'Driving a car is not just about speed; it\'s about the connection between driver, machine, and road. It requires finesse, respect for the power at your disposal, and an understanding of the vehicle\'s dynamics. This post explores the techniques and mindset needed to truly master these incredible automobiles. From understanding weight transfer in corners to mastering the paddle shifters for seamless acceleration, every detail counts. Join us as we delve into the exhilarating world of high-performance driving.' 
    },
    { 
      id: 2, 
      title: 'Top 5 Mediterranean Yachting Destinations', 
      content: 'From the azure waters of the Amalfi Coast to the hidden coves of the Greek Isles, the Mediterranean is a yachter\'s paradise. Discover our top five destinations for an unforgettable sea voyage, complete with tips on the best anchorages, finest restaurants, and most breathtaking sights to see. We cover everything from the glamorous ports of St. Tropez to the tranquil beauty of Croatia\'s islands.' 
    },
];

// Helper function to scroll to the top of the page
const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const PostPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPost = () => {
      setLoading(true);
      setError(null);
      // Simulate a network request
      setTimeout(() => {
        try {
          const postId = parseInt(id || '', 10);
          if (isNaN(postId)) {
            throw new Error('Invalid post ID specified.');
          }
          const foundPost = mockPosts.find(p => p.id === postId);

          if (!foundPost) {
            throw new Error(`Post with ID ${id} not found.`);
          }
          
          setPost(foundPost);
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }, 500);
    };

    if (id) {
      fetchPost();
    }
  }, [id]);
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="pt-32 pb-24 bg-black min-h-screen text-white"
    >
      <div className="container mx-auto px-6 max-w-4xl">
        {loading && (
          <div className="text-center">
            <h1 className="text-4xl font-bold">{t('Loading_Post')}</h1>
          </div>
        )}
        
        {error && (
          <div className="text-center bg-gray-800/50 border border-gray-700 p-8 rounded-lg">
            <h1 className="text-3xl font-bold text-red-400">{t('Error_Fetching_Post')}</h1>
            <p className="text-gray-300 mt-2">{error}</p>
          </div>
        )}

        {post && (
          <article className="prose prose-invert prose-lg max-w-none">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-4xl md:text-5xl font-bold text-white border-b-2 border-white pb-4 mb-8"
            >
              {post.title}
            </motion.h1>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <p>{post.content}</p>

              <div className="mt-12 text-center">
                <button
                  onClick={scrollToTop}
                  className="bg-white text-black px-8 py-3 font-bold uppercase tracking-widest text-sm hover:bg-gray-200 transition-all duration-300 transform hover:scale-105"
                >
                  {t('Go_to_Top')}
                </button>
              </div>
            </motion.div>
          </article>
        )}
      </div>
    </motion.div>
  );
};

export default PostPage;