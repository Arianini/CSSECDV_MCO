// ============================================
// POST FUNCTIONS
// ============================================

function togglePostOptions(postId) {
    // Close all other menus
    document.querySelectorAll('.options-menu').forEach(menu => {
        if (menu.id !== `options-menu-${postId}`) {
            menu.style.display = 'none';
        }
    });
    
    const menu = document.getElementById(`options-menu-${postId}`);
    if (menu) {
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
        
        // Stop propagation on the menu itself
        if (!isVisible) {
            menu.onclick = function(e) {
                e.stopPropagation();
            };
        }
    }
}

// Close all menus when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.post-options') && 
        !event.target.closest('.comment-options') &&
        !event.target.closest('.options-menu') &&
        !event.target.closest('.comment-options-menu')) {
        
        document.querySelectorAll('.options-menu, .comment-options-menu').forEach(menu => {
            menu.style.display = 'none';
        });
    }
});

function editPost(postId) {
    document.getElementById(`caption-text-${postId}`).style.display = "none";
    document.getElementById(`edit-container-${postId}`).style.display = "block";
    // Close the menu
    const menu = document.getElementById(`options-menu-${postId}`);
    if (menu) menu.style.display = 'none';
}

function cancelEditPost(postId) {
    document.getElementById(`caption-text-${postId}`).style.display = "block";
    document.getElementById(`edit-container-${postId}`).style.display = "none";
}

async function saveEditPost(postId) {
    const newCaption = document.getElementById(`edit-caption-${postId}`).value.trim();

    if (!newCaption) {
        showError("Caption cannot be empty!");
        return;
    }

    try {
        const response = await fetch(`/edit-post/${postId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caption: newCaption }),
        });

        if (response.ok) {
            document.getElementById(`caption-text-${postId}`).innerText = newCaption + " (Edited)";
            document.getElementById(`caption-text-${postId}`).style.display = "block";
            document.getElementById(`edit-container-${postId}`).style.display = "none";
            showSuccess("Post updated successfully!");
        } else {
            showError("Failed to update post.");
        }
    } catch (error) {
        console.error("Error updating post:", error);
        showError("An error occurred while updating the post.");
    }
}

async function deletePost(postId) {
    console.log('ðŸ”´ DELETE BUTTON CLICKED! Post ID:', postId);
    
    // Close the menu immediately
    const menu = document.getElementById(`options-menu-${postId}`);
    if (menu) {
        console.log('âœ… Menu found and closing');
        menu.style.display = 'none';
    }
    
    console.log('ðŸ”µ About to call showConfirm...');
    
    const confirmed = await showConfirm(
        "This action cannot be undone.",
        "Delete this post?"
    );
    
    console.log('ðŸŸ¢ User response:', confirmed);
    
    if (!confirmed) {
        console.log('âŒ User cancelled delete');
        return;
    }

    console.log('ðŸš€ User confirmed! Sending DELETE request...');

    try {
        const response = await fetch(`/delete-post/${postId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
        });

        console.log('ðŸ“¡ Response received. Status:', response.status);

        if (response.ok) {
            console.log('âœ… Server said OK');
            const postElement = document.getElementById(`post-${postId}`);
            if (postElement) {
                console.log('âœ… Post element found, removing from DOM');
                postElement.remove();
                showSuccess("Post deleted successfully!");
                console.log('âœ… Delete complete!');
            }
        } else {
            console.log('âŒ Server returned error');
            showError("Failed to delete post.");
        }
    } catch (error) {
        console.error("ðŸ’¥ ERROR:", error);
        showError("An error occurred while deleting the post.");
    }
}
// Event delegation for delete buttons
document.addEventListener('click', function(e) {
    // Handle delete button clicks
    if (e.target.classList.contains('delete-post-btn')) {
        e.stopPropagation();
        const postId = e.target.getAttribute('data-post-id');
        console.log('ðŸ”´ DELETE CLICKED via event delegation! Post ID:', postId);
        deletePost(postId);
    }
    
    // Handle edit button clicks
    if (e.target.classList.contains('edit-post-btn')) {
        e.stopPropagation();
        const postId = e.target.getAttribute('data-post-id');
        console.log('âœï¸ EDIT CLICKED via event delegation! Post ID:', postId);
        editPost(postId);
    }
    
    // Handle report button clicks
    if (e.target.classList.contains('report-post-btn')) {
        e.stopPropagation();
        const postId = e.target.getAttribute('data-post-id');
        console.log('âš ï¸ REPORT CLICKED via event delegation! Post ID:', postId);
        reportPost(postId);
    }
});

function reportPost(postId) {
    const menu = document.getElementById(`options-menu-${postId}`);
    if (menu) menu.style.display = 'none';
    openReportModal(postId);
}

function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewContainer = document.getElementById("image-preview-container");
            const previewImage = document.getElementById("image-preview");

            previewImage.src = e.target.result;
            previewContainer.style.display = "block";
        };
        reader.readAsDataURL(file);
    }
}

document.getElementById("post-image").addEventListener("change", function (event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById("preview-image").src = e.target.result;
            document.getElementById("preview-image").style.display = "block";
        };
        reader.readAsDataURL(file);
    }
});

console.log('ðŸŸ¦ Setting up submit-post-btn listener');

// Wait for DOM to be ready
const setupSubmitButton = () => {
    const submitBtn = document.getElementById("submit-post-btn");
    if (!submitBtn) {
        console.error('âŒ submit-post-btn not found!');
        return;
    }
    
    console.log('âœ… submit-post-btn found');

    submitBtn.addEventListener("click", async function (e) {
        e.preventDefault(); // Prevent form submission
        e.stopPropagation(); // Stop event bubbling
        
        console.log('ðŸŸ¦ Submit button clicked!');
        
        const caption = document.getElementById("post-caption").value.trim();
        const postTag = document.getElementById("post-tag").value.trim(); 
        const imageInput = document.getElementById("post-image").files[0];

        console.log('ðŸ“ Caption:', caption);
        console.log('ðŸ·ï¸ Tag:', postTag);
        console.log('ðŸ–¼ï¸ Image:', imageInput);

        if (!caption && !imageInput) {
            console.log('âŒ Validation failed: no caption and no image');
            showError("Post must contain either a caption or an image.");
            return;
        }

        if (!postTag) {
            console.log('âŒ Validation failed: no tag');
            showError("Please enter a post tag.");
            return;
        }

        console.log('âœ… Validation passed, creating post...');

        const formData = new FormData();
        formData.append("caption", caption);
        formData.append("postTag", postTag);
        if (imageInput) {
            formData.append("image", imageInput);
        }

        try {
            const response = await fetch("/create-post", {
                method: "POST",
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                console.log('âœ… Post created successfully!');
                location.reload(); // Just reload immediately
            } else {
                console.log('âŒ Server error:', result.error);
                showError(result.error || "Failed to create post.");
            }
        } catch (error) {
            console.error("ðŸ’¥ Error creating post:", error);
            showError("An error occurred while creating the post.");
        }
    });
};

// Run setup when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSubmitButton);
} else {
    setupSubmitButton();
}

// ============================================
// PROFILE PICTURE FUNCTIONS
// ============================================

function toggleProfilePicMenu() {
    let menu = document.getElementById("profile-pic-menu");
    menu.style.display = menu.style.display === "block" ? "none" : "block";
}

function previewProfileImage() {
    let fileInput = document.getElementById("profile-pic-input");
    let previewImage = document.getElementById("preview-image");

    if (fileInput.files && fileInput.files[0]) {
        let reader = new FileReader();
        reader.onload = function (e) {
            previewImage.src = e.target.result;
        };
        reader.readAsDataURL(fileInput.files[0]);
    }
}

async function saveProfilePic() {
    let fileInput = document.getElementById("profile-pic-input");

    if (!fileInput.files.length) {
        showError("Please select a file!");
        return;
    }

    let formData = new FormData();
    formData.append("profilePic", fileInput.files[0]);

    let response = await fetch("/update-profile-pic", {
        method: "POST",
        body: formData
    });

    let data = await response.json();
    if (data.success) {
        document.getElementById("profile-image").src = data.newProfilePic;
        toggleProfilePicMenu();
        showSuccess("Profile picture updated successfully!");
    } else {
        showError("Failed to update profile picture.");
    }
}

function cancelProfilePic() {
    document.getElementById("profile-pic-menu").style.display = "none";
}

// ============================================
// LIKE/DISLIKE POST FUNCTIONS
// ============================================

async function toggleLike(type, id) {
    try {
        const endpoint = type === 'post' ? `/like/${id}` : `/like-comment/${id}`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const result = await response.json();
        if (!result.success) {
            showError("Failed to like.");
            return;
        }

        const likeBtn = document.getElementById(`like-btn-${type}-${id}`);
        const dislikeBtn = document.getElementById(`dislike-btn-${type}-${id}`);
        const likeCountEl = likeBtn?.nextElementSibling;
        const dislikeCountEl = dislikeBtn?.nextElementSibling;

        if (likeCountEl) likeCountEl.textContent = result.likesCount || 0;
        if (dislikeCountEl) dislikeCountEl.textContent = result.dislikesCount || 0;

        if (result.liked) {
            likeBtn?.classList.add("active");
            dislikeBtn?.classList.remove("active");
        } else {
            likeBtn?.classList.remove("active");
        }
    } catch (error) {
        console.error("Error toggling like:", error);
        showError("Failed to like.");
    }
}

async function toggleDislike(type, id) {
    try {
        const endpoint = type === 'post' ? `/dislike/${id}` : `/dislike-comment/${id}`;
        const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const result = await response.json();
        if (!result.success) {
            showError("Failed to dislike.");
            return;
        }

        const likeBtn = document.getElementById(`like-btn-${type}-${id}`);
        const dislikeBtn = document.getElementById(`dislike-btn-${type}-${id}`);
        const likeCountEl = likeBtn?.nextElementSibling;
        const dislikeCountEl = dislikeBtn?.nextElementSibling;

        if (likeCountEl) likeCountEl.textContent = result.likesCount || 0;
        if (dislikeCountEl) dislikeCountEl.textContent = result.dislikesCount || 0;

        if (result.disliked) {
            dislikeBtn?.classList.add("active");
            likeBtn?.classList.remove("active");
        } else {
            dislikeBtn?.classList.remove("active");
        }
    } catch (error) {
        console.error("Error toggling dislike:", error);
        showError("Failed to dislike.");
    }
}

// ============================================
// COMMENTS FUNCTIONS
// ============================================

function toggleComments(postId) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    if (commentsSection) {
        commentsSection.style.display = 
            commentsSection.style.display === "none" ? "block" : "none";
    }
}

function toggleCommentOptions(commentId) {
    // Close all other menus
    const allMenus = document.querySelectorAll(".comment-options-menu");
    allMenus.forEach(menu => {
        if (menu.id !== `comment-options-${commentId}`) {
            menu.style.display = "none";
        }
    });

    const menu = document.getElementById(`comment-options-${commentId}`);
    if (menu) {
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
        
        // Stop propagation on the menu itself
        if (!isVisible) {
            menu.onclick = function(e) {
                e.stopPropagation();
            };
        }
    }
}

async function addComment(postId) {
    const commentInput = document.getElementById(`comment-input-${postId}`);
    const commentText = commentInput.value.trim();

    if (!commentText) {
        showWarning("Comment cannot be empty!");
        return;
    }

    try {
        const response = await fetch(`/add-comment/${postId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentText })
        });

        const data = await response.json();

        if (data.success) {
            const commentsSection = document.getElementById(`comments-${postId}`);
            if (commentsSection) {
                commentsSection.insertAdjacentHTML('beforeend', data.html);
            }

            commentInput.value = "";
            
            const commentCount = document.getElementById(`comment-count-${postId}`);
            if (commentCount) {
                commentCount.textContent = parseInt(commentCount.textContent) + 1;
            }
            
            showSuccess("Comment added successfully!");
        } else {
            showError(data.error || "Failed to add comment.");
        }
    } catch (error) {
        console.error("Error adding comment:", error);
        showError("An error occurred while adding the comment.");
    }
}

async function deleteComment(postId, commentId) {
    // Close the menu immediately
    const menu = document.getElementById(`comment-options-${commentId}`);
    if (menu) menu.style.display = 'none';
    
    const confirmed = await showConfirm(
        "This action cannot be undone.",
        "Delete this comment?"
    );
    
    if (!confirmed) return;

    try {
        const response = await fetch(`/delete-comment/${postId}/${commentId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById(`comment-${commentId}`).remove();
            showSuccess("Comment deleted successfully!");
        } else {
            showError(data.error || "Failed to delete comment.");
        }
    } catch (error) {
        console.error("Error deleting comment:", error);
        showError("An error occurred while deleting the comment.");
    }
}

function openEditCommentModal(commentId) {
    const menu = document.getElementById(`comment-options-${commentId}`);
    if (menu) menu.style.display = 'none';
    
    const modal = document.getElementById(`edit-comment-modal-${commentId}`);
    if (modal) {
        modal.style.display = "flex";
    }
}

function closeEditCommentModal(commentId) {
    const modal = document.getElementById(`edit-comment-modal-${commentId}`);
    if (modal) {
        modal.style.display = "none";
    }
}

async function saveEditedComment(commentId) {
    const textarea = document.getElementById(`edit-comment-input-${commentId}`);
    const newContent = textarea.value.trim();

    if (!newContent) {
        showError("Comment content cannot be empty!");
        return;
    }

    const commentEl = document.getElementById(`comment-${commentId}`);
    const postId = commentEl.closest(".comments-section")?.id?.replace("comments-", "");

    if (!postId) {
        showError("Unable to determine post ID.");
        return;
    }

    try {
        const response = await fetch(`/edit-comment/${postId}/${commentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updatedContent: newContent })
        });

        const result = await response.json();

        if (result.success) {
            const commentText = document.getElementById(`comment-text-${commentId}`);
            if (commentText) {
                commentText.textContent = result.updatedComment;
            }
            closeEditCommentModal(commentId);
            showSuccess("Comment updated successfully!");
        } else {
            showError(result.error || "Failed to update comment.");
        }
    } catch (error) {
        console.error("Error editing comment:", error);
        showError("An error occurred while updating the comment.");
    }
}

async function toggleLikeComment(postId, commentId) {
    try {
        const response = await fetch(`/like-comment/${postId}/${commentId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const result = await response.json();
        if (!result.success) {
            showError("Failed to like comment.");
        } else {
            document.getElementById(`like-count-${commentId}`).textContent = result.likesCount;
            document.getElementById(`dislike-count-${commentId}`).textContent = result.dislikesCount;

            const likeBtn = document.getElementById(`like-btn-comment-${commentId}`);
            const dislikeBtn = document.getElementById(`dislike-btn-comment-${commentId}`);

            if (result.liked) {
                likeBtn.classList.add("active");
                dislikeBtn.classList.remove("active");
            } else {
                likeBtn.classList.remove("active");
            }
        }
    } catch (error) {
        console.error("Error liking comment:", error);
        showError("Failed to like comment.");
    }
}

async function toggleDislikeComment(postId, commentId) {
    try {
        const response = await fetch(`/dislike-comment/${postId}/${commentId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const result = await response.json();
        if (!result.success) {
            showError("Failed to dislike comment.");
        } else {
            document.getElementById(`like-count-${commentId}`).textContent = result.likesCount;
            document.getElementById(`dislike-count-${commentId}`).textContent = result.dislikesCount;

            const likeBtn = document.getElementById(`like-btn-comment-${commentId}`);
            const dislikeBtn = document.getElementById(`dislike-btn-comment-${commentId}`);

            if (result.disliked) {
                dislikeBtn.classList.add("active");
                likeBtn.classList.remove("active");
            } else {
                dislikeBtn.classList.remove("active");
            }
        }
    } catch (error) {
        console.error("Error disliking comment:", error);
        showError("Failed to dislike comment.");
    }
}

// ============================================
// REPLY FUNCTIONS
// ============================================

function toggleReplySection(commentId) {
    const replySection = document.getElementById(`reply-section-${commentId}`);
    if (replySection) {
        replySection.style.display = 
            (replySection.style.display === "none" || replySection.style.display === "") 
            ? "block" : "none";
    }
}

function cancelReply(commentId) {
    const replySection = document.getElementById(`reply-section-${commentId}`);
    if (replySection) {
        replySection.style.display = "none";
    }
}

async function submitReply(commentId) {
    const input = document.getElementById(`reply-input-${commentId}`);
    const replyText = input.value.trim();

    if (!replyText) {
        showWarning("Reply cannot be empty!");
        return;
    }

    const commentEl = document.getElementById(`comment-${commentId}`);
    const postId = commentEl.closest(".comments-section")?.id?.replace("comments-", "");

    if (!postId) {
        showError("Unable to determine post ID.");
        return;
    }

    try {
        const res = await fetch(`/reply-comment/${postId}/${commentId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ replyText })
        });

        const data = await res.json();
        if (data.success) {
            let replyContainer = commentEl.querySelector(`#replies-${commentId}`);
            if (!replyContainer) {
                replyContainer = document.createElement("div");
                replyContainer.id = `replies-${commentId}`;
                replyContainer.className = "replies";
                commentEl.appendChild(replyContainer);
            }

            replyContainer.insertAdjacentHTML("beforeend", data.html);

            input.value = "";
            toggleReplySection(commentId);
            showSuccess("Reply added successfully!");
        } else {
            showError("Failed to add reply.");
        }
    } catch (err) {
        console.error("Error submitting reply:", err);
        showError("An error occurred while submitting the reply.");
    }
}

function toggleReplyOptions(replyId) {
    // Close all other menus
    const allMenus = document.querySelectorAll(".comment-options-menu");
    allMenus.forEach(menu => {
        if (menu.id !== `reply-options-${replyId}`) {
            menu.style.display = "none";
        }
    });

    const menu = document.getElementById(`reply-options-${replyId}`);
    if (menu) {
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
        
        // Stop propagation on the menu itself
        if (!isVisible) {
            menu.onclick = function(e) {
                e.stopPropagation();
            };
        }
    }
}

async function deleteReply(postId, commentId, replyId) {
    // Close the menu immediately
    const menu = document.getElementById(`reply-options-${replyId}`);
    if (menu) menu.style.display = 'none';
    
    const confirmed = await showConfirm(
        "This action cannot be undone.",
        "Delete this reply?"
    );
    
    if (!confirmed) return;

    try {
        const response = await fetch(`/delete-reply/${postId}/${commentId}/${replyId}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();

        if (data.success) {
            document.getElementById(`reply-${replyId}`).remove();
            showSuccess("Reply deleted successfully!");
        } else {
            showError(data.error || "Failed to delete reply.");
        }
    } catch (error) {
        console.error("Error deleting reply:", error);
        showError("An error occurred while deleting the reply.");
    }
}

function openEditReplyModal(replyId) {
    const menu = document.getElementById(`reply-options-${replyId}`);
    if (menu) menu.style.display = 'none';
    
    const modal = document.getElementById(`edit-reply-modal-${replyId}`);
    if (!modal) {
        console.error(`Modal not found for reply: ${replyId}`);
        return;
    }
    modal.style.display = "flex";
}

function closeEditReplyModal(replyId) {
    const modal = document.getElementById(`edit-reply-modal-${replyId}`);
    if (modal) {
        modal.style.display = "none";
    }
}

async function saveEditedReply(postId, commentId, replyId) {
    const modal = document.getElementById(`edit-reply-modal-${replyId}`);
    const textarea = document.getElementById(`edit-reply-input-${replyId}`);
    const newContent = textarea.value.trim();

    if (!newContent) {
        showError("Reply content cannot be empty!");
        return;
    }

    try {
        const res = await fetch(`/edit-reply/${postId}/${commentId}/${replyId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updatedContent: newContent })
        });

        const result = await res.json();

        if (result.success) {
            const replyText = document.getElementById(`reply-text-${replyId}`);
            if (replyText) {
                replyText.textContent = result.updatedReply;
            } else {
                console.warn("reply-text element not found for:", replyId);
            }

            closeEditReplyModal(replyId);
            showSuccess("Reply updated successfully!");
        } else {
            showError(result.error || "Failed to edit reply.");
        }
    } catch (error) {
        console.error("Error editing reply:", error);
        showError("An error occurred while updating the reply.");
    }
}

// ============================================
// LIKE/DISLIKE REPLY FUNCTIONS
// ============================================

async function likeReply(postId, commentId, replyId) {
    try {
        const response = await fetch(`/reply-like/${postId}/${commentId}/${replyId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const result = await response.json();
        if (!result.success) {
            showError("Failed to like reply.");
        } else {
            document.getElementById(`reply-like-${replyId}`).textContent = result.likesCount;
            document.getElementById(`reply-dislike-${replyId}`).textContent = result.dislikesCount;

            const likeBtn = document.querySelector(`#reply-${replyId} button:nth-of-type(1)`);
            const dislikeBtn = document.querySelector(`#reply-${replyId} button:nth-of-type(2)`);

            if (result.liked) {
                likeBtn.classList.add("active");
                dislikeBtn.classList.remove("active");
            } else {
                likeBtn.classList.remove("active");
            }
        }
    } catch (error) {
        console.error("Error liking reply:", error);
        showError("Failed to like reply.");
    }
}

async function dislikeReply(postId, commentId, replyId) {
    try {
        const response = await fetch(`/reply-dislike/${postId}/${commentId}/${replyId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const result = await response.json();
        if (!result.success) {
            showError("Failed to dislike reply.");
        } else {
            document.getElementById(`reply-like-${replyId}`).textContent = result.likesCount;
            document.getElementById(`reply-dislike-${replyId}`).textContent = result.dislikesCount;

            const likeBtn = document.querySelector(`#reply-${replyId} button:nth-of-type(1)`);
            const dislikeBtn = document.querySelector(`#reply-${replyId} button:nth-of-type(2)`);

            if (result.disliked) {
                dislikeBtn.classList.add("active");
                likeBtn.classList.remove("active");
            } else {
                dislikeBtn.classList.remove("active");
            }
        }
    } catch (error) {
        console.error("Error disliking reply:", error);
        showError("Failed to dislike reply.");
    }
}