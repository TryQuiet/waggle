import isBase64 from 'is-base64'

const  isHex= (h) =>{
    var a = parseInt(h,16);
    return (a.toString(16) ===h.toLowerCase())
    }

// export const validate = {
//     a: '02dc8264c555d46b3f6b16f1e751e979ebc69e6df6a02e7d4074a5df981e507da2', - 66
//     b: '0bfb475810c0e26c9fab590d47c3d60ec533bb3c451596acc3cd4f21602e9ad9', - 64

export const isValidUser = (publicKey: string, halfKey: string) => {
return publicKey.length === 66 && halfKey.length === 64 && isHex(publicKey) && isHex(halfKey)
}




// isValidPublicMessage = () => {

// }
// isValidDirectMessage = () => {

// }
// isValidConversation

